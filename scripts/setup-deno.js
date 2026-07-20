// One-time setup: downloads a portable Deno binary and places it into
// resources/bin, right next to yt-dlp.exe.
//
// Recent yt-dlp versions need an external JavaScript runtime to solve
// YouTube's signature challenge (this is the "WARNING: No supported
// JavaScript runtime could be found" message). Deno is yt-dlp's
// default-enabled runtime, and per yt-dlp's own docs it's auto-detected
// with zero extra command-line flags as long as the deno executable is
// either on PATH or sitting in the same folder as yt-dlp.exe on Windows —
// which is exactly resources/bin here (and, from Phase 7 onward, the
// writable per-user copy main.js seeds it into alongside the live
// yt-dlp.exe). So this script only needs to put deno.exe there; nothing
// about how yt-dlp gets invoked has to change.
//
// Run with: npm run setup

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DENO_RELEASE_URL = 'https://api.github.com/repos/denoland/deno/releases/latest';
const DENO_ASSET_NAME = 'deno-x86_64-pc-windows-msvc.zip';

const ROOT = path.join(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'resources', 'bin');
const TMP_ZIP = path.join(ROOT, '.tmp-deno.zip');
const TMP_EXTRACT = path.join(ROOT, '.tmp-deno-extract');

function findFile(dir, filename) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, filename);
      if (found) return found;
    } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
      return full;
    }
  }
  return null;
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('This app targets Windows, so deno auto-download only runs on win32.');
    console.log('If you are just testing the UI on another OS and need real YouTube');
    console.log('extraction to work, place your own deno binary into resources/bin');
    console.log('by hand.');
    return;
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });
  const destPath = path.join(BIN_DIR, 'deno.exe');

  if (fs.existsSync(destPath)) {
    console.log('deno.exe already present in resources/bin — skipping download.');
    return;
  }

  console.log('Fetching latest Deno release info...');
  const headers = { 'User-Agent': 'yt-downloader-setup' };
  // Same reasoning as setup-ytdlp.js: not required, but raises the GitHub
  // API rate limit from 60/hr to 5000/hr when running in CI.
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const releaseRes = await fetch(DENO_RELEASE_URL, { headers });
  if (!releaseRes.ok) {
    throw new Error(`GitHub request failed: ${releaseRes.status} ${releaseRes.statusText}`);
  }
  const release = await releaseRes.json();
  const asset = Array.isArray(release.assets)
    ? release.assets.find((a) => a && a.name === DENO_ASSET_NAME)
    : null;
  if (!asset || !asset.browser_download_url) {
    throw new Error(`Could not find ${DENO_ASSET_NAME} in the latest Deno release.`);
  }

  console.log(`Downloading Deno ${release.tag_name}...`);
  const res = await fetch(asset.browser_download_url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(TMP_ZIP, buffer);

  console.log('Extracting...');
  fs.mkdirSync(TMP_EXTRACT, { recursive: true });
  execSync(
    `powershell -Command "Expand-Archive -Path '${TMP_ZIP}' -DestinationPath '${TMP_EXTRACT}' -Force"`,
    { stdio: 'inherit' }
  );

  const denoExe = findFile(TMP_EXTRACT, 'deno.exe');
  if (!denoExe) {
    throw new Error('Could not find deno.exe inside the downloaded archive.');
  }

  fs.copyFileSync(denoExe, destPath);

  fs.rmSync(TMP_ZIP, { force: true });
  fs.rmSync(TMP_EXTRACT, { recursive: true, force: true });

  console.log(`Done — deno.exe (${release.tag_name}) is now in resources/bin.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
