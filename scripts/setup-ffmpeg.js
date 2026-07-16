// One-time setup: downloads a static Windows ffmpeg build and places
// ffmpeg.exe + ffprobe.exe into resources/bin so the app can find them.
//
// yt-dlp.exe is small enough to ship directly in the project, but ffmpeg
// is ~150MB, so instead of bundling it we fetch it once here.
//
// Run with: npm run setup

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG_ZIP_URL =
  'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-win64-gpl-8.1.zip';

const ROOT = path.join(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'resources', 'bin');
const TMP_ZIP = path.join(ROOT, '.tmp-ffmpeg.zip');
const TMP_EXTRACT = path.join(ROOT, '.tmp-ffmpeg-extract');

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
    console.log('This app targets Windows, so ffmpeg auto-download only runs on win32.');
    console.log('If you are just testing the UI on another OS, place your own');
    console.log('ffmpeg / ffprobe binaries into resources/bin manually.');
    return;
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });

  if (fs.existsSync(path.join(BIN_DIR, 'ffmpeg.exe'))) {
    console.log('ffmpeg.exe already present in resources/bin — skipping download.');
    return;
  }

  console.log('Downloading ffmpeg (one-time, ~150MB)...');
  const res = await fetch(FFMPEG_ZIP_URL, { redirect: 'follow' });
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

  const ffmpegExe = findFile(TMP_EXTRACT, 'ffmpeg.exe');
  const ffprobeExe = findFile(TMP_EXTRACT, 'ffprobe.exe');

  if (!ffmpegExe || !ffprobeExe) {
    throw new Error('Could not find ffmpeg.exe / ffprobe.exe inside the downloaded archive.');
  }

  fs.copyFileSync(ffmpegExe, path.join(BIN_DIR, 'ffmpeg.exe'));
  fs.copyFileSync(ffprobeExe, path.join(BIN_DIR, 'ffprobe.exe'));

  fs.rmSync(TMP_ZIP, { force: true });
  fs.rmSync(TMP_EXTRACT, { recursive: true, force: true });

  console.log('Done — ffmpeg.exe and ffprobe.exe are now in resources/bin.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
