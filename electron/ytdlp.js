// Pure functions for building yt-dlp arguments and parsing its output.
// Kept free of any spawn/process logic so they can be unit-tested without
// needing the real binary or a network connection.

const path = require('path');

// Video info is fetched once, up front, as a single JSON blob — this is
// yt-dlp's own '-J' flag, no download happens.
function buildInfoArgs(url) {
  return ['-J', '--no-warnings', url];
}

function parseVideoInfo(jsonText) {
  const data = JSON.parse(jsonText);
  return {
    id: data.id,
    title: data.title,
    duration: data.duration ?? null,
    thumbnail: data.thumbnail ?? null,
    uploader: data.uploader ?? null,
  };
}

// Where the downloaded file goes. Section (clip) downloads get their own
// suffix so they never collide with a full download of the same video.
function buildOutputTemplate(downloadsDir, isSection) {
  const suffix = isSection ? ' (clip).%(ext)s' : '.%(ext)s';
  return path.join(downloadsDir, `%(title)s [%(id)s]${suffix}`);
}

// section is either null (full video) or { start, end } in whole seconds.
function buildDownloadArgs({ url, outputTemplate, ffmpegDir, section }) {
  const args = [
    '-f', 'bv*+ba/b',
    '--merge-output-format', 'mp4',
    '--ffmpeg-location', ffmpegDir,
    '-o', outputTemplate,
    '--newline',
    // Prints one clean JSON object per progress update — far more robust
    // than regex-matching yt-dlp's human-readable "45.2% of 50MiB..." text.
    '--progress-template', 'download:%(progress)j',
    // Prints the real, final file path once the download (and any
    // merge/move) is actually complete — confirmed against yt-dlp's source
    // to run as a genuine download, not just a simulation.
    '--print', 'after_move:%(filepath)s',
  ];

  if (section) {
    args.push('--download-sections', `*${section.start}-${section.end}`);
    args.push('--force-keyframes-at-cuts');
  }

  args.push(url);
  return args;
}

// Turns one line of yt-dlp stdout into a progress update, or null if the
// line isn't a progress update at all (log lines, the final filepath, etc).
function parseProgressLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || !('status' in parsed)) {
    return null;
  }

  const { status, downloaded_bytes: downloadedBytes, total_bytes: totalBytes,
    total_bytes_estimate: totalBytesEstimate, eta, speed } = parsed;

  const total = totalBytes ?? totalBytesEstimate ?? null;
  const percent = status === 'finished'
    ? 100
    : (total && downloadedBytes != null)
      ? Math.min(100, (downloadedBytes / total) * 100)
      : null;

  return {
    status,
    percent,
    downloadedBytes: downloadedBytes ?? null,
    totalBytes: total,
    eta: eta ?? null,
    speed: speed ?? null,
  };
}

// Our --print directive outputs a bare absolute Windows path
// (e.g. "C:\Users\me\Downloads\video.mp4"). Everything else yt-dlp prints
// is either JSON (progress) or starts with a "[tag]" prefix, so a bare
// drive-letter path is an unambiguous signal.
function isLikelyFilePath(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return /^[A-Za-z]:\\/.test(trimmed);
}

module.exports = {
  buildInfoArgs,
  parseVideoInfo,
  buildOutputTemplate,
  buildDownloadArgs,
  parseProgressLine,
  isLikelyFilePath,
};
