// Orchestrates an actual yt-dlp run: spawns the process, streams progress
// back via a callback, and verifies the result once it's done. This file
// is intentionally thin — the parsing/logic it depends on lives in
// ytdlp.js and verify.js, where it can actually be unit-tested.

const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');

const {
  buildInfoArgs,
  buildDownloadArgs,
  buildOutputTemplate,
  parseVideoInfo,
  parseProgressLine,
  isLikelyFilePath,
} = require('./ytdlp');
const { probeDuration, isDurationCloseEnough } = require('./verify');

function getVideoInfo(ytDlpPath, url) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ytDlpPath, buildInfoArgs(url));
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => reject(new Error(`Could not run yt-dlp: ${err.message}`)));

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
      }
      try {
        resolve(parseVideoInfo(stdout));
      } catch (err) {
        reject(new Error(`Could not read video info: ${err.message}`));
      }
    });
  });
}

// section is either null (full video) or { start, end } in whole seconds.
// onProgress is called with each parsed progress update as it comes in.
//
// Resume note: this always targets the same output path for the same
// video+section, and never passes --no-continue, so if a previous attempt
// left a .part file behind, yt-dlp resumes it by default instead of
// starting over.
function downloadVideo({ ytDlpPath, ffprobePath, ffmpegDir, url, downloadsDir, section, quality, format, audioOnly, audioFormat, onProgress }) {
  return new Promise((resolve, reject) => {
    const outputTemplate = buildOutputTemplate(downloadsDir, Boolean(section));
    const args = buildDownloadArgs({ url, outputTemplate, ffmpegDir, section, quality, format, audioOnly, audioFormat });
    const proc = spawn(ytDlpPath, args);

    let resultFilePath = null;
    let stderr = '';

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      const progress = parseProgressLine(line);
      if (progress) {
        if (onProgress) onProgress(progress);
        return;
      }
      if (isLikelyFilePath(line)) {
        resultFilePath = line.trim();
      }
    });

    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => reject(new Error(`Could not run yt-dlp: ${err.message}`)));

    proc.on('close', async (code) => {
      if (code !== 0) {
        return reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
      }
      if (!resultFilePath || !fs.existsSync(resultFilePath)) {
        return reject(new Error('Download finished but the output file could not be located.'));
      }

      // A download only counts as "done" once it's verified here — a
      // clean process exit alone isn't proof the file is actually intact.
      const expectedDuration = section ? section.end - section.start : null;

      let actualDuration = null;
      try {
        actualDuration = await probeDuration(ffprobePath, resultFilePath);
      } catch (err) {
        return reject(new Error(`Download finished but could not be verified: ${err.message}`));
      }

      const verified = expectedDuration
        ? isDurationCloseEnough(actualDuration, expectedDuration, 5)
        : actualDuration != null;

      resolve({ filePath: resultFilePath, actualDuration, verified });
    });
  });
}

module.exports = { getVideoInfo, downloadVideo };
