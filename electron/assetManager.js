// Orchestrates the three Phase 3 "extra" saves — thumbnail, subtitles,
// metadata. Each is independent of the others and of the main video
// download, matching the app's "isolate failures" philosophy: a failed
// thumbnail save can't break a subtitle save or vice versa. This file is
// intentionally thin, same as downloadManager.js — the parsing/naming
// logic it relies on lives in ytdlp.js and assets.js, where it can
// actually be unit-tested.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const { buildSubtitleArgs, parseSubtitleFilename, extractErrorMessage } = require('./ytdlp');
const {
  buildThumbnailOutputPath,
  buildMetadataOutputPath,
  guessExtensionFromUrl,
  buildThumbnailConvertArgs,
  buildMetadataContent,
} = require('./assets');
const { probeImageDimensions } = require('./verify');
const { runBinary } = require('./engine');

// Fetches the chosen thumbnail URL directly (yt-dlp has no way to pick one
// specific thumbnail out of the list via its CLI), then always routes it
// through ffmpeg to guarantee the requested output format, then verifies
// with ffprobe that the result is a real, decodable image — not just that
// the HTTP request and the ffmpeg process both happened to exit cleanly.
async function downloadThumbnail({ ffmpegPath, ffprobePath, thumbnailUrl, downloadsDir, title, id, format }) {
  const outputPath = buildThumbnailOutputPath(downloadsDir, title, id, format);
  const sourceExt = guessExtensionFromUrl(thumbnailUrl);
  const tempPath = path.join(os.tmpdir(), `xebec-thumb-${id}-${Date.now()}.${sourceExt}`);

  let response;
  try {
    response = await fetch(thumbnailUrl);
  } catch (err) {
    throw new Error(`Could not reach thumbnail URL: ${err.message}`);
  }
  if (!response.ok) {
    throw new Error(`Could not fetch thumbnail: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(tempPath, buffer);

  try {
    await runBinary(ffmpegPath, buildThumbnailConvertArgs(tempPath, outputPath));
  } finally {
    fs.rmSync(tempPath, { force: true });
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error('Thumbnail conversion finished but the output file could not be found.');
  }

  const { width, height } = await probeImageDimensions(ffprobePath, outputPath);
  const verified = Boolean(width && height);

  return { filePath: outputPath, width, height, verified };
}

// section/audio-only downloads reuse the same yt-dlp process per request;
// subtitles are the one case where a single yt-dlp run can partially
// succeed (some requested languages exist, some don't) without yt-dlp
// itself treating that as an error. So instead of trusting the exit code
// alone, the downloads folder is scanned afterward for which of the
// requested languages actually landed a file.
function downloadSubtitles({ ytDlpPath, ffmpegDir, url, downloadsDir, id, langs, format }) {
  return new Promise((resolve, reject) => {
    if (!langs || langs.length === 0) {
      return reject(new Error('No subtitle language selected.'));
    }

    const outputTemplate = path.join(downloadsDir, '%(title)s [%(id)s].%(ext)s');
    const args = buildSubtitleArgs({ url, outputTemplate, ffmpegDir, langs, format });
    const proc = spawn(ytDlpPath, args);

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => reject(new Error(`Could not run yt-dlp: ${err.message}`)));

    proc.on('close', (code) => {
      if (code !== 0) {
        if (stderr.trim()) console.error(stderr.trim());
        return reject(new Error(extractErrorMessage(stderr) || `yt-dlp exited with code ${code}`));
      }

      let entries = [];
      try {
        entries = fs.readdirSync(downloadsDir);
      } catch (err) {
        return reject(new Error(`Could not verify subtitle files: ${err.message}`));
      }

      const files = {};
      for (const entry of entries) {
        const parsed = parseSubtitleFilename(entry, id);
        if (parsed && langs.includes(parsed.lang)) {
          files[parsed.lang] = path.join(downloadsDir, entry);
        }
      }

      const succeeded = langs.filter((l) => files[l]);
      const failed = langs.filter((l) => !files[l]);

      resolve({ succeeded, failed, files, verified: failed.length === 0 });
    });
  });
}

// Metadata is built entirely from the info already fetched by
// video:getInfo — no extra network call needed. Verified by making sure
// the file actually landed on disk with real content, not a 0-byte write.
function saveMetadata({ downloadsDir, title, id, format, info }) {
  const outputPath = buildMetadataOutputPath(downloadsDir, title, id, format);
  const content = buildMetadataContent(info, format);
  fs.writeFileSync(outputPath, content, 'utf-8');

  const stat = fs.statSync(outputPath);
  const verified = stat.size > 0;

  return { filePath: outputPath, verified };
}

module.exports = { downloadThumbnail, downloadSubtitles, saveMetadata };
