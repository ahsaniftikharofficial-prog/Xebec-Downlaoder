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
    resolutions: extractResolutions(data.formats),
  };
}

// Pulls the real, distinct video resolutions this specific video actually
// offers, highest first. Only counts formats that include a video stream
// (ignores audio-only formats), so the quality dropdown never offers a
// resolution that doesn't really exist for this video.
function extractResolutions(formats) {
  if (!Array.isArray(formats)) return [];
  const heights = new Set();
  for (const f of formats) {
    if (f && f.vcodec && f.vcodec !== 'none' && Number.isFinite(f.height)) {
      heights.add(f.height);
    }
  }
  return [...heights].sort((a, b) => b - a);
}

// Where the downloaded file goes. Section (clip) downloads get their own
// suffix so they never collide with a full download of the same video.
function buildOutputTemplate(downloadsDir, isSection) {
  const suffix = isSection ? ' (clip).%(ext)s' : '.%(ext)s';
  return path.join(downloadsDir, `%(title)s [%(id)s]${suffix}`);
}

// section is either null (full video) or { start, end } in whole seconds.
// quality is either null (best available) or a target height like 1080 —
// pulled from this video's real resolution list (see extractResolutions).
// format is the output container for a video download: 'mp4' | 'mkv' | 'webm'.
// audioOnly + audioFormat switch the whole download to audio-only, converted
// via ffmpeg to 'mp3' | 'm4a' | 'wav' instead of a video container.
function buildDownloadArgs({ url, outputTemplate, ffmpegDir, section, quality, format, audioOnly, audioFormat }) {
  const args = [];

  if (audioOnly) {
    args.push('-f', 'bestaudio/best');
    args.push('-x', '--audio-format', audioFormat || 'mp3');
  } else {
    // Capping height on both halves of the selector keeps the cap honest
    // even if yt-dlp falls back to a single pre-muxed format instead of
    // merging separate video+audio streams.
    const heightCap = quality ? `[height<=${quality}]` : '';
    args.push('-f', `bv*${heightCap}+ba/b${heightCap}`);
    // merge-output-format sets the container when two streams get merged;
    // remux-video sets it when yt-dlp already picked one pre-muxed format
    // (merge-output-format is ignored in that case). Together they make
    // sure the format dropdown's choice always lands on disk.
    args.push('--merge-output-format', format || 'mp4');
    args.push('--remux-video', format || 'mp4');
  }

  args.push(
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
  );

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
  extractResolutions,
  buildOutputTemplate,
  buildDownloadArgs,
  parseProgressLine,
  isLikelyFilePath,
};
