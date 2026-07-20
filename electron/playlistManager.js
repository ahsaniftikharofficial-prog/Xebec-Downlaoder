// Orchestrates the two playlist operations: fetching the fast listing
// (getPlaylistInfo) and running the download queue (downloadPlaylist).
// Intentionally thin, same reasoning as downloadManager.js and
// assetManager.js — the parsing/queue logic it depends on lives in
// playlist.js, where it can actually be unit-tested.

const { spawn } = require('child_process');
const { buildPlaylistInfoArgs, parsePlaylistInfo, processQueue } = require('./playlist');
const { downloadVideo } = require('./downloadManager');
const { extractErrorMessage } = require('./ytdlp');

function getPlaylistInfo(ytDlpPath, url) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ytDlpPath, buildPlaylistInfoArgs(url));
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => reject(new Error(`Could not run yt-dlp: ${err.message}`)));

    proc.on('close', (code) => {
      if (code !== 0) {
        if (stderr.trim()) console.error(stderr.trim());
        return reject(new Error(extractErrorMessage(stderr) || `yt-dlp exited with code ${code}`));
      }
      try {
        resolve(parsePlaylistInfo(stdout));
      } catch (err) {
        reject(new Error(`Could not read playlist info: ${err.message}`));
      }
    });
  });
}

// Each selected item is downloaded through the exact same downloadVideo()
// Phase 1 built for single videos — verification and resume both come along
// for free, since it's the same function either way, one video at a time.
// quality/format/audioOnly apply to every item in the batch; there's no
// per-playlist format picker in this phase (see the README for why).
function downloadPlaylist({ ytDlpPath, ffprobePath, ffmpegDir, downloadsDir, items, quality, format, audioOnly, audioFormat, onItemUpdate }) {
  return processQueue({
    items,
    onItemUpdate,
    downloadItem: (item, onProgress) =>
      downloadVideo({
        ytDlpPath,
        ffprobePath,
        ffmpegDir,
        downloadsDir,
        url: item.url,
        section: null,
        quality: quality || null,
        format: format || null,
        audioOnly: Boolean(audioOnly),
        audioFormat: audioFormat || null,
        onProgress,
      }),
  });
}

module.exports = { getPlaylistInfo, downloadPlaylist };
