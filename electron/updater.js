// Pure functions behind the self-healing engine: comparing versions,
// parsing GitHub's release JSON to find the right download, naming/pruning
// backup files, and reading/merging the small metadata file that tracks
// what's installed. Kept free of fs/network/spawn so all of it can be
// unit-tested without touching the real filesystem or GitHub.

const path = require('path');

// yt-dlp tags releases as plain dates ('2025.06.09') with an occasional
// trailing hotfix segment ('2023.03.04.1'). Splitting on any non-digit and
// comparing part-by-part handles both, and degrades safely for any other
// dotted-numeric version scheme too.
function compareVersions(a, b) {
  const partsOf = (v) => String(v ?? '').split(/[^0-9]+/).filter(Boolean).map(Number);
  const pa = partsOf(a);
  const pb = partsOf(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

function isNewerVersion(currentVersion, latestVersion) {
  if (!currentVersion || !latestVersion) return false;
  return compareVersions(currentVersion, latestVersion) < 0;
}

// Given yt-dlp's GitHub "latest release" API response, finds the tag
// (version) and the direct download URL for yt-dlp.exe specifically —
// yt-dlp ships many assets per release (linux, macOS, source tarballs...),
// and only the single Windows exe is ever relevant here.
function parseYtDlpRelease(releaseJson) {
  const tag = releaseJson && typeof releaseJson.tag_name === 'string' ? releaseJson.tag_name : null;
  const assets = releaseJson && Array.isArray(releaseJson.assets) ? releaseJson.assets : [];
  const asset = assets.find((a) => a && a.name === 'yt-dlp.exe');

  if (!tag || !asset || !asset.browser_download_url) {
    throw new Error('Could not find a yt-dlp.exe build in the latest GitHub release.');
  }

  return { version: tag, downloadUrl: asset.browser_download_url };
}

// BtbN/FFmpeg-Builds publishes several Windows/Linux/macOS builds, both
// shared and static, under one release. Only the static (non-"shared")
// 64-bit Windows GPL build is what setup-ffmpeg.js already downloads, so
// self-healing has to pick that exact same one, not just "any win64 zip".
function pickFfmpegAsset(assets) {
  if (!Array.isArray(assets)) return null;
  const match = assets.find(
    (a) =>
      a &&
      typeof a.name === 'string' &&
      /-win64-gpl-/i.test(a.name) &&
      a.name.toLowerCase().endsWith('.zip') &&
      !/shared/i.test(a.name)
  );
  return match || null;
}

// ffmpeg's own build names don't carry a clean, comparable version number
// (BtbN republishes new builds under the same rolling "latest" tag), so
// instead of a semver-style comparison, "has this changed?" is answered by
// tracking a marker string built from the asset's name + GitHub's own
// last-updated timestamp for it. If either changes, a new build was
// published.
function parseFfmpegRelease(releaseJson) {
  const assets = releaseJson && Array.isArray(releaseJson.assets) ? releaseJson.assets : [];
  const asset = pickFfmpegAsset(assets);

  if (!asset || !asset.browser_download_url) {
    throw new Error('Could not find a Windows ffmpeg build in the latest GitHub release.');
  }

  return {
    marker: `${asset.name}:${asset.updated_at || asset.id || ''}`,
    downloadUrl: asset.browser_download_url,
    assetName: asset.name,
  };
}

// Backup filenames look like 'yt-dlp-2025.06.09.exe' — the version tag is
// sanitized since it ends up as part of a real filename.
function buildVersionedFilename(binName, versionTag) {
  const ext = path.extname(binName);
  const base = binName.slice(0, binName.length - ext.length);
  const safeTag = String(versionTag).trim().replace(/[^A-Za-z0-9.-]+/g, '-');
  return `${base}-${safeTag}${ext}`;
}

// Decides which backup files to delete so the versions folder doesn't grow
// forever. Takes { name, savedAt } objects (savedAt any sortable value —
// callers pass real mtimeMs) and keeps the `keep` most recent, returning
// the rest as filenames to remove.
function selectVersionsToPrune(files, keep) {
  if (!Array.isArray(files)) return [];
  const sorted = [...files].sort((a, b) => b.savedAt - a.savedAt);
  return sorted.slice(Math.max(keep, 0)).map((f) => f.name);
}

const DEFAULT_ENGINE_METADATA = {
  ytDlp: { lastCheckedAt: null, lastUpdate: null },
  ffmpeg: { lastCheckedAt: null, marker: null, lastUpdate: null },
};

function cloneDefaultMetadata() {
  return JSON.parse(JSON.stringify(DEFAULT_ENGINE_METADATA));
}

// Shallow-merges per-binary fields so an update to one binary's info never
// clobbers the other's, and unknown/corrupted shapes fall back safely.
function mergeEngineMetadata(current, updates) {
  const base = current && typeof current === 'object' ? current : cloneDefaultMetadata();
  const upd = updates && typeof updates === 'object' ? updates : {};
  return {
    ytDlp: { ...cloneDefaultMetadata().ytDlp, ...base.ytDlp, ...upd.ytDlp },
    ffmpeg: { ...cloneDefaultMetadata().ffmpeg, ...base.ffmpeg, ...upd.ffmpeg },
  };
}

function parseEngineMetadata(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    return mergeEngineMetadata(cloneDefaultMetadata(), data && typeof data === 'object' ? data : {});
  } catch {
    return cloneDefaultMetadata();
  }
}

module.exports = {
  compareVersions,
  isNewerVersion,
  parseYtDlpRelease,
  pickFfmpegAsset,
  parseFfmpegRelease,
  buildVersionedFilename,
  selectVersionsToPrune,
  DEFAULT_ENGINE_METADATA,
  mergeEngineMetadata,
  parseEngineMetadata,
};
