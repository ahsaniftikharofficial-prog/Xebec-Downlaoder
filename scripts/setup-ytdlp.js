// One-time setup: downloads the latest yt-dlp.exe and places it into
// resources/bin, the same way setup-ffmpeg.js does for ffmpeg.
//
// This didn't exist before Phase 8 — yt-dlp.exe had to be placed there by
// hand, which is fine for a single dev machine but doesn't work for an
// automated CI build, which is exactly what Phase 8's GitHub Actions
// workflow needs. Reuses the same release-parsing logic Phase 7's
// self-healing engine uses, so there's exactly one place that knows how
// to read yt-dlp's GitHub releases.
//
// Run with: npm run setup (runs this together with setup-ffmpeg.js)

const fs = require('fs');
const path = require('path');
const { parseYtDlpRelease } = require('../electron/updater');

const YTDLP_RELEASE_URL = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const ROOT = path.join(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'resources', 'bin');

async function main() {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const destPath = path.join(BIN_DIR, 'yt-dlp.exe');

  if (fs.existsSync(destPath)) {
    console.log('yt-dlp.exe already present in resources/bin — skipping download.');
    return;
  }

  console.log('Fetching latest yt-dlp release info...');
  const headers = { 'User-Agent': 'yt-downloader-setup' };
  // In CI, GitHub Actions provides a token that raises the API rate limit
  // from 60/hr to 5000/hr — worth using if it's there, but this script
  // works fine without it too (as it does for a local dev machine).
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const releaseRes = await fetch(YTDLP_RELEASE_URL, { headers });
  if (!releaseRes.ok) {
    throw new Error(`GitHub request failed: ${releaseRes.status} ${releaseRes.statusText}`);
  }
  const { version, downloadUrl } = parseYtDlpRelease(await releaseRes.json());

  console.log(`Downloading yt-dlp ${version}...`);
  const res = await fetch(downloadUrl, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  fs.chmodSync(destPath, 0o755); // no-op on Windows, harmless elsewhere

  console.log(`Done — yt-dlp.exe (${version}) is now in resources/bin.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
