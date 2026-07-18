// Orchestrates the actual self-healing work: talking to GitHub, downloading
// and extracting files, and moving binaries around on disk. Intentionally
// thin on logic — comparisons, parsing, and filename/pruning decisions all
// live in updater.js, where they're unit-tested without needing real
// network or filesystem access.

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const { getBinPath, getWritableBinPath, getVersionsDir, runBinary } = require('./engine');
const {
  isNewerVersion,
  parseYtDlpRelease,
  parseFfmpegRelease,
  buildVersionedFilename,
  selectVersionsToPrune,
  parseEngineMetadata,
} = require('./updater');

const YTDLP_RELEASE_URL = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const FFMPEG_RELEASE_URL = 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/tags/latest';

// Keeps this many previous versions of each binary on disk (in addition to
// the one currently in use) — enough to roll back a bad update without
// letting the versions folder grow forever.
const MAX_KEPT_VERSIONS = 3;

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'yt-downloader-app' } });
  if (!res.ok) throw new Error(`GitHub request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

async function downloadToFile(url, destPath) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(destPath, buffer);
  // No-op on Windows (the platform this app actually ships for), but
  // harmless and useful if this ever runs somewhere that cares about the
  // executable bit.
  await fsp.chmod(destPath, 0o755).catch(() => {});
}

// The writable copy of a binary is what the app actually runs from Phase 7
// onward. The first time a given binary is needed on a machine, it's
// seeded from the bundled original — after that, self-healing owns it.
async function ensureEngineBinary(userDataPath, resourcesRoot, isDev, binName) {
  const writablePath = getWritableBinPath(userDataPath, binName);
  if (fs.existsSync(writablePath)) return writablePath;

  const bundledPath = getBinPath(resourcesRoot, isDev, binName);
  if (!fs.existsSync(bundledPath)) {
    throw new Error(`${binName} was not found. Reinstall the app, or run "npm run setup" in dev.`);
  }

  await fsp.mkdir(path.dirname(writablePath), { recursive: true });
  await fsp.copyFile(bundledPath, writablePath);
  return writablePath;
}

async function readEngineMetadata(metadataFilePath) {
  try {
    const text = await fsp.readFile(metadataFilePath, 'utf-8');
    return parseEngineMetadata(text);
  } catch (err) {
    if (err.code === 'ENOENT') return parseEngineMetadata('{}');
    throw err;
  }
}

async function writeEngineMetadata(metadataFilePath, metadata) {
  await fsp.mkdir(path.dirname(metadataFilePath), { recursive: true });
  await fsp.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2), 'utf-8');
}

function metadataFilePathFor(userDataPath) {
  return path.join(userDataPath, 'engine-versions.json');
}

// Deletes old backups beyond MAX_KEPT_VERSIONS for one binary. Best-effort
// on purpose — a cleanup hiccup should never be treated as an update
// failure, since the update itself already succeeded by this point.
async function pruneVersionsDir(versionsDir, baseName) {
  try {
    const entries = await fsp.readdir(versionsDir);
    const ext = path.extname(baseName);
    const stem = baseName.slice(0, baseName.length - ext.length);
    const prefix = `${stem}-`;

    const candidates = entries.filter((name) => name.startsWith(prefix) && name.toLowerCase().endsWith(ext.toLowerCase()));
    const withStats = await Promise.all(
      candidates.map(async (name) => {
        const stat = await fsp.stat(path.join(versionsDir, name));
        return { name, savedAt: stat.mtimeMs };
      })
    );

    const toDelete = selectVersionsToPrune(withStats, MAX_KEPT_VERSIONS);
    await Promise.all(toDelete.map((name) => fsp.rm(path.join(versionsDir, name), { force: true })));
  } catch {
    // Non-fatal — worst case the versions folder keeps a few extra files.
  }
}

// Checks yt-dlp against its latest GitHub release, and updates it in place
// if newer. The freshly downloaded build is verified (it must actually run
// and report the version GitHub said it would) before it's trusted to
// replace anything — a bad or truncated download never overwrites a
// working install.
async function checkAndUpdateYtDlp({ userDataPath, resourcesRoot, isDev }) {
  const liveBinPath = await ensureEngineBinary(userDataPath, resourcesRoot, isDev, 'yt-dlp.exe');

  let currentVersion;
  try {
    currentVersion = (await runBinary(liveBinPath, ['--version'])).trim();
  } catch (err) {
    return { binary: 'yt-dlp', updated: false, error: `Could not read the current version: ${err.message}` };
  }

  let release;
  try {
    release = parseYtDlpRelease(await fetchJson(YTDLP_RELEASE_URL));
  } catch (err) {
    return { binary: 'yt-dlp', updated: false, currentVersion, error: `Could not check for updates: ${err.message}` };
  }

  if (!isNewerVersion(currentVersion, release.version)) {
    return { binary: 'yt-dlp', updated: false, currentVersion };
  }

  const versionsDir = getVersionsDir(userDataPath);
  await fsp.mkdir(versionsDir, { recursive: true });
  const tempPath = path.join(versionsDir, `.yt-dlp-download-${Date.now()}.tmp`);

  try {
    await downloadToFile(release.downloadUrl, tempPath);

    const downloadedVersion = (await runBinary(tempPath, ['--version'])).trim();
    if (downloadedVersion !== release.version) {
      throw new Error(`Downloaded build reported version "${downloadedVersion}", expected "${release.version}".`);
    }

    // Preserve the currently-live binary before overwriting it.
    const backupPath = path.join(versionsDir, buildVersionedFilename('yt-dlp.exe', currentVersion));
    await fsp.copyFile(liveBinPath, backupPath);
    await fsp.rename(tempPath, liveBinPath);
    await pruneVersionsDir(versionsDir, 'yt-dlp.exe');

    return { binary: 'yt-dlp', updated: true, previousVersion: currentVersion, newVersion: downloadedVersion };
  } catch (err) {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    return { binary: 'yt-dlp', updated: false, currentVersion, error: err.message };
  }
}

// Extracts a zip on Windows via PowerShell, the same approach already used
// by scripts/setup-ffmpeg.js — no extra unzip dependency needed.
async function extractZip(zipPath, destDir) {
  await execFileAsync('powershell', [
    '-Command',
    `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`,
  ]);
}

function findFileRecursive(dir, filename) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, filename);
      if (found) return found;
    } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
      return full;
    }
  }
  return null;
}

// ffmpeg.exe and ffprobe.exe come from the same zip and are always updated
// together as a pair, so they can never end up mismatched. Windows-only —
// on any other platform this is a deliberate no-op, same as
// scripts/setup-ffmpeg.js.
async function checkAndUpdateFfmpeg({ userDataPath, resourcesRoot, isDev, storedMarker }) {
  if (process.platform !== 'win32') {
    return { binary: 'ffmpeg', updated: false, skipped: true };
  }

  const liveFfmpegPath = await ensureEngineBinary(userDataPath, resourcesRoot, isDev, 'ffmpeg.exe');
  const liveFfprobePath = await ensureEngineBinary(userDataPath, resourcesRoot, isDev, 'ffprobe.exe');

  let release;
  try {
    release = parseFfmpegRelease(await fetchJson(FFMPEG_RELEASE_URL));
  } catch (err) {
    return { binary: 'ffmpeg', updated: false, error: `Could not check for updates: ${err.message}` };
  }

  if (!storedMarker) {
    // First check ever on this machine — trust whatever's already
    // installed (it was just set up) rather than re-downloading ~150MB
    // the app doesn't actually need yet. Future checks compare against
    // this marker instead.
    return { binary: 'ffmpeg', updated: false, marker: release.marker, firstCheck: true };
  }

  if (release.marker === storedMarker) {
    return { binary: 'ffmpeg', updated: false, marker: release.marker };
  }

  const versionsDir = getVersionsDir(userDataPath);
  await fsp.mkdir(versionsDir, { recursive: true });
  const tempZip = path.join(versionsDir, `.ffmpeg-download-${Date.now()}.zip`);
  const tempExtract = path.join(versionsDir, `.ffmpeg-extract-${Date.now()}`);

  try {
    await downloadToFile(release.downloadUrl, tempZip);
    await fsp.mkdir(tempExtract, { recursive: true });
    await extractZip(tempZip, tempExtract);

    const newFfmpeg = findFileRecursive(tempExtract, 'ffmpeg.exe');
    const newFfprobe = findFileRecursive(tempExtract, 'ffprobe.exe');
    if (!newFfmpeg || !newFfprobe) {
      throw new Error('Downloaded archive did not contain ffmpeg.exe and ffprobe.exe.');
    }

    // Both must actually run before either replaces the live pair.
    await runBinary(newFfmpeg, ['-version']);
    await runBinary(newFfprobe, ['-version']);

    const tag = new Date().toISOString().slice(0, 10);
    await fsp.copyFile(liveFfmpegPath, path.join(versionsDir, buildVersionedFilename('ffmpeg.exe', tag)));
    await fsp.copyFile(liveFfprobePath, path.join(versionsDir, buildVersionedFilename('ffprobe.exe', tag)));

    await fsp.copyFile(newFfmpeg, liveFfmpegPath);
    await fsp.copyFile(newFfprobe, liveFfprobePath);

    await pruneVersionsDir(versionsDir, 'ffmpeg.exe');
    await pruneVersionsDir(versionsDir, 'ffprobe.exe');

    return {
      binary: 'ffmpeg',
      updated: true,
      previousVersion: storedMarker,
      newVersion: release.marker,
      marker: release.marker,
      backupTag: tag,
    };
  } catch (err) {
    return { binary: 'ffmpeg', updated: false, marker: storedMarker, error: err.message };
  } finally {
    await fsp.rm(tempZip, { force: true }).catch(() => {});
    await fsp.rm(tempExtract, { recursive: true, force: true }).catch(() => {});
  }
}

async function safely(fn) {
  try {
    return await fn();
  } catch (err) {
    return { updated: false, error: err.message };
  }
}

// Top-level entry point, called once on launch. yt-dlp and ffmpeg are
// checked independently — one failing (no internet, GitHub down, a bad
// build) never blocks or breaks the other, the same "one broken thing
// doesn't take the rest down" principle Phase 4 uses for playlist batches.
async function checkAndUpdateEngine({ userDataPath, resourcesRoot, isDev }) {
  const metadataFilePath = metadataFilePathFor(userDataPath);
  const metadata = await readEngineMetadata(metadataFilePath);
  const now = new Date().toISOString();

  const ytDlpResult = await safely(() => checkAndUpdateYtDlp({ userDataPath, resourcesRoot, isDev }));
  const ffmpegResult = await safely(() =>
    checkAndUpdateFfmpeg({ userDataPath, resourcesRoot, isDev, storedMarker: metadata.ffmpeg.marker })
  );

  const nextMetadata = {
    ytDlp: {
      lastCheckedAt: now,
      lastUpdate: ytDlpResult.updated
        ? { at: now, previousVersion: ytDlpResult.previousVersion, newVersion: ytDlpResult.newVersion, acknowledged: false }
        : metadata.ytDlp.lastUpdate,
    },
    ffmpeg: {
      lastCheckedAt: now,
      marker: ffmpegResult.marker || metadata.ffmpeg.marker,
      lastUpdate: ffmpegResult.updated
        ? {
            at: now,
            previousVersion: ffmpegResult.previousVersion,
            newVersion: ffmpegResult.newVersion,
            backupTag: ffmpegResult.backupTag,
            acknowledged: false,
          }
        : metadata.ffmpeg.lastUpdate,
    },
  };

  await writeEngineMetadata(metadataFilePath, nextMetadata);

  return { ytDlp: ytDlpResult, ffmpeg: ffmpegResult, metadata: nextMetadata };
}

// Manual rollback for yt-dlp: restores the backup made just before the
// last recorded update. Nothing is deleted — the version being rolled
// back FROM is itself backed up first, in case the rollback was a mistake.
async function rollbackYtDlp({ userDataPath, resourcesRoot, isDev }) {
  const metadataFilePath = metadataFilePathFor(userDataPath);
  const metadata = await readEngineMetadata(metadataFilePath);
  const lastUpdate = metadata.ytDlp.lastUpdate;

  if (!lastUpdate || lastUpdate.rolledBackAt) {
    throw new Error('There is no recent yt-dlp update to roll back.');
  }

  const versionsDir = getVersionsDir(userDataPath);
  const backupPath = path.join(versionsDir, buildVersionedFilename('yt-dlp.exe', lastUpdate.previousVersion));
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Version ${lastUpdate.previousVersion} is no longer on disk — it may have been cleaned up.`);
  }

  const verifiedVersion = (await runBinary(backupPath, ['--version'])).trim();
  if (verifiedVersion !== lastUpdate.previousVersion) {
    throw new Error('The backed-up version failed verification — rollback aborted.');
  }

  const liveBinPath = await ensureEngineBinary(userDataPath, resourcesRoot, isDev, 'yt-dlp.exe');
  const rolledBackFromPath = path.join(versionsDir, buildVersionedFilename('yt-dlp.exe', lastUpdate.newVersion));
  if (!fs.existsSync(rolledBackFromPath)) {
    await fsp.copyFile(liveBinPath, rolledBackFromPath);
  }
  await fsp.copyFile(backupPath, liveBinPath);

  const nextMetadata = {
    ...metadata,
    ytDlp: { ...metadata.ytDlp, lastUpdate: { ...lastUpdate, rolledBackAt: new Date().toISOString() } },
  };
  await writeEngineMetadata(metadataFilePath, nextMetadata);

  return { binary: 'yt-dlp', rolledBackTo: lastUpdate.previousVersion };
}

// Manual rollback for the ffmpeg/ffprobe pair. previousVersion here is the
// marker string from before the update, so the backup filename tag has to
// be looked up the same way it was saved (a date-stamped tag), which is
// recovered from the update record instead of the marker itself.
async function rollbackFfmpeg({ userDataPath, resourcesRoot, isDev }) {
  const metadataFilePath = metadataFilePathFor(userDataPath);
  const metadata = await readEngineMetadata(metadataFilePath);
  const lastUpdate = metadata.ffmpeg.lastUpdate;

  if (!lastUpdate || lastUpdate.rolledBackAt || !lastUpdate.backupTag) {
    throw new Error('There is no recent ffmpeg update to roll back.');
  }

  const versionsDir = getVersionsDir(userDataPath);
  const backupFfmpeg = path.join(versionsDir, buildVersionedFilename('ffmpeg.exe', lastUpdate.backupTag));
  const backupFfprobe = path.join(versionsDir, buildVersionedFilename('ffprobe.exe', lastUpdate.backupTag));

  if (!fs.existsSync(backupFfmpeg) || !fs.existsSync(backupFfprobe)) {
    throw new Error('The previous ffmpeg build is no longer on disk — it may have been cleaned up.');
  }

  await runBinary(backupFfmpeg, ['-version']);
  await runBinary(backupFfprobe, ['-version']);

  const liveFfmpegPath = await ensureEngineBinary(userDataPath, resourcesRoot, isDev, 'ffmpeg.exe');
  const liveFfprobePath = await ensureEngineBinary(userDataPath, resourcesRoot, isDev, 'ffprobe.exe');

  const currentTag = new Date().toISOString().slice(0, 10);
  await fsp.copyFile(liveFfmpegPath, path.join(versionsDir, buildVersionedFilename('ffmpeg.exe', `${currentTag}-reverted`)));
  await fsp.copyFile(liveFfprobePath, path.join(versionsDir, buildVersionedFilename('ffprobe.exe', `${currentTag}-reverted`)));

  await fsp.copyFile(backupFfmpeg, liveFfmpegPath);
  await fsp.copyFile(backupFfprobe, liveFfprobePath);

  const nextMetadata = {
    ...metadata,
    ffmpeg: { ...metadata.ffmpeg, lastUpdate: { ...lastUpdate, rolledBackAt: new Date().toISOString() } },
  };
  await writeEngineMetadata(metadataFilePath, nextMetadata);

  return { binary: 'ffmpeg', rolledBackTo: lastUpdate.previousVersion };
}

async function acknowledgeEngineUpdate(userDataPath, binary) {
  const metadataFilePath = metadataFilePathFor(userDataPath);
  const metadata = await readEngineMetadata(metadataFilePath);
  const key = binary === 'yt-dlp' ? 'ytDlp' : binary;
  if (metadata[key] && metadata[key].lastUpdate) {
    metadata[key].lastUpdate.acknowledged = true;
  }
  await writeEngineMetadata(metadataFilePath, metadata);
  return metadata;
}

module.exports = {
  ensureEngineBinary,
  readEngineMetadata,
  writeEngineMetadata,
  metadataFilePathFor,
  checkAndUpdateYtDlp,
  checkAndUpdateFfmpeg,
  checkAndUpdateEngine,
  rollbackYtDlp,
  rollbackFfmpeg,
  acknowledgeEngineUpdate,
};
