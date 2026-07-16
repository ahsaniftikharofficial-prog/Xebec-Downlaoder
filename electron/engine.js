// Helper functions for locating and talking to the bundled yt-dlp / ffmpeg
// binaries. Kept separate from main.js so the pure logic here can be
// unit-tested without needing to actually launch Electron.

const path = require('path');
const { spawn } = require('child_process');

// In dev, the binaries live in <project root>/resources/bin.
// In a packaged app, electron-builder copies that same folder into the
// app's resources directory (see "extraResources" in package.json), so we
// read from process.resourcesPath/bin instead.
function getBinPath(resourcesRoot, isDev, binName) {
  const base = isDev
    ? path.join(resourcesRoot, 'resources', 'bin')
    : path.join(resourcesRoot, 'bin');
  return path.join(base, binName);
}

// ffmpeg -version prints several lines of build config; the UI only
// needs the first line.
function firstLine(text) {
  return text.split('\n')[0].trim();
}

// Runs a bundled binary with the given args and resolves with its stdout.
function runBinary(binPath, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(binPath, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      reject(new Error(`Could not run ${binPath}: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `${binPath} exited with code ${code}`));
      }
    });
  });
}

module.exports = { getBinPath, firstLine, runBinary };
