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
    thumbnails: extractThumbnails(data.thumbnails),
    uploader: data.uploader ?? null,
    // "channel" is the display name of the channel; some extractions only
    // ever populate "uploader", so that's the fallback rather than null.
    channel: data.channel ?? data.uploader ?? null,
    uploadDate: formatUploadDate(data.upload_date),
    description: data.description ?? null,
    url: data.webpage_url ?? null,
    resolutions: extractResolutions(data.formats),
    subtitleTracks: extractSubtitleTracks(data.subtitles, data.automatic_captions),
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

// Thumbnails come back as a list of candidate images at different sizes;
// sorting best-first (largest reported area) means "auto" can just take
// index 0, and the picker dropdown naturally lists large-to-small.
// Thumbnails with no reported width/height are kept (some extractors omit
// it) but sorted to the end, so "auto" never ends up with nothing at all.
function extractThumbnails(thumbnails) {
  if (!Array.isArray(thumbnails)) return [];
  const seen = new Set();
  const result = [];
  for (const t of thumbnails) {
    if (!t || !t.url || seen.has(t.url)) continue;
    seen.add(t.url);
    result.push({
      id: t.id ?? null,
      url: t.url,
      width: Number.isFinite(t.width) ? t.width : null,
      height: Number.isFinite(t.height) ? t.height : null,
    });
  }
  result.sort((a, b) => {
    const areaA = a.width && a.height ? a.width * a.height : -1;
    const areaB = b.width && b.height ? b.width * b.height : -1;
    return areaB - areaA;
  });
  return result;
}

// A language can have a manual (human-written) track, an auto-generated
// one, or both. When both exist for the same language, only the manual one
// is listed — it's written by a person, the auto one is a machine guess of
// the exact same language.
function extractSubtitleTracks(subtitles, automaticCaptions) {
  const tracks = new Map();

  if (subtitles && typeof subtitles === 'object') {
    for (const code of Object.keys(subtitles)) {
      tracks.set(code, { code, name: subtitleTrackName(code, subtitles[code]), auto: false });
    }
  }
  if (automaticCaptions && typeof automaticCaptions === 'object') {
    for (const code of Object.keys(automaticCaptions)) {
      if (tracks.has(code)) continue; // manual track already covers this language
      tracks.set(code, { code, name: subtitleTrackName(code, automaticCaptions[code]), auto: true });
    }
  }

  return [...tracks.values()].sort((a, b) => a.code.localeCompare(b.code));
}

// yt-dlp sometimes includes a human-readable "name" on each format entry
// (e.g. "English"); falls back to the bare language code when it doesn't.
function subtitleTrackName(code, formats) {
  const withName = Array.isArray(formats) && formats.find((f) => f && f.name);
  return (withName && withName.name) || code;
}

// yt-dlp reports upload_date as a bare 'YYYYMMDD' string; both the UI and
// the saved metadata file want a readable 'YYYY-MM-DD' instead.
function formatUploadDate(uploadDate) {
  if (typeof uploadDate !== 'string' || !/^\d{8}$/.test(uploadDate)) return null;
  return `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6, 8)}`;
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

// Requests subtitle files without downloading the video itself.
// --write-subs and --write-auto-subs are both passed so yt-dlp writes
// whichever of manual/auto actually exists for each requested language —
// harmless if a language only has one or the other, and it never fails the
// run just because some of the requested languages don't exist.
// --sub-format and --convert-subs are set together for the same reason the
// video download pairs --merge-output-format with --remux-video: it
// guarantees the chosen format lands on disk even when YouTube's native
// subtitle format for that language is something else entirely.
function buildSubtitleArgs({ url, outputTemplate, ffmpegDir, langs, format }) {
  return [
    '--skip-download',
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs', (langs || []).join(','),
    '--sub-format', format || 'srt',
    '--convert-subs', format || 'srt',
    '--ffmpeg-location', ffmpegDir,
    '-o', outputTemplate,
    '--no-warnings',
    url,
  ];
}

// yt-dlp names subtitle files "<title> [<id>].<lang>.<ext>". The video id
// is the one part of that filename guaranteed not to get mangled by
// yt-dlp's own title-sanitizing, so results are matched on it rather than
// trying to reproduce that sanitizing ourselves. Returns null for anything
// that isn't a subtitle file for this id (including this video's own
// video/audio file, which has no language segment).
function parseSubtitleFilename(filename, id) {
  if (!filename.includes(`[${id}]`)) return null;
  const match = filename.match(/\.([A-Za-z0-9-]+)\.([A-Za-z0-9]+)$/);
  if (!match) return null;
  return { lang: match[1], ext: match[2] };
}

// yt-dlp's stderr often carries one or more multi-line WARNING messages
// (deprecation notices, the "no JS runtime" notice, etc.) printed before
// the actual ERROR line that made the process fail. Every caller here
// used to reject with the whole raw blob, which meant the UI showed
// paragraphs of warning text on top of the one line that actually
// mattered. This pulls out just the "ERROR:" line(s) so the app can show
// something a user can actually read at a glance — the full stderr is
// still there in the console/log for anyone debugging.
function extractErrorMessage(stderr) {
  const trimmed = (stderr || '').trim();
  if (!trimmed) return '';

  const errorLines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('ERROR:'));

  return errorLines.length > 0 ? errorLines.join(' ') : trimmed;
}

module.exports = {
  buildInfoArgs,
  parseVideoInfo,
  extractResolutions,
  extractThumbnails,
  extractSubtitleTracks,
  formatUploadDate,
  buildOutputTemplate,
  buildDownloadArgs,
  buildSubtitleArgs,
  parseProgressLine,
  parseSubtitleFilename,
  isLikelyFilePath,
  extractErrorMessage,
};
