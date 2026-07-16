// Pure helpers for the two Phase 3 assets we name and write ourselves
// instead of letting yt-dlp's own output template handle it: the
// thumbnail image and the metadata file. Kept free of any fs/spawn logic
// so it can be unit-tested without touching disk.

const path = require('path');

// Windows forbids these characters in filenames outright, and silently
// strips trailing dots/spaces. Stripping them ourselves up front avoids a
// save that looks like it worked but actually landed under a slightly
// different name than the one shown in the UI.
function sanitizeFilename(name) {
  const cleaned = (name || 'video')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/[\s.]+$/, '');
  return cleaned || 'video';
}

function buildThumbnailOutputPath(downloadsDir, title, id, format) {
  const name = `${sanitizeFilename(title)} [${id}] - thumbnail.${format}`;
  return path.join(downloadsDir, name);
}

function buildMetadataOutputPath(downloadsDir, title, id, format) {
  const name = `${sanitizeFilename(title)} [${id}] - metadata.${format}`;
  return path.join(downloadsDir, name);
}

// Best-effort guess at the source thumbnail's real extension, purely so
// the temp file it's fetched into has a sane name before ffmpeg converts
// it. Falls back to webp, which is what YouTube serves most thumbnail
// URLs as, if the URL doesn't make the extension obvious.
function guessExtensionFromUrl(url) {
  const match = (url || '').match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
  return match ? match[1].toLowerCase() : 'webp';
}

// Always routing the thumbnail through ffmpeg — even when the source
// happens to already be the target format — guarantees the file that
// lands on disk really is what the format dropdown said, the same
// reasoning as the video download's --merge-output-format +
// --remux-video pairing in ytdlp.js.
function buildThumbnailConvertArgs(sourcePath, outputPath) {
  return ['-y', '-i', sourcePath, outputPath];
}

// Builds the actual saved-metadata content. JSON is the full structured
// record; txt is a short human-readable summary of the same fields.
function buildMetadataContent(info, format) {
  const record = {
    id: info?.id ?? null,
    title: info?.title ?? null,
    channel: info?.channel ?? null,
    uploadDate: info?.uploadDate ?? null,
    duration: info?.duration ?? null,
    url: info?.url ?? null,
    description: info?.description ?? null,
  };

  if (format === 'txt') {
    return [
      `Title: ${record.title ?? 'Unknown'}`,
      `Channel: ${record.channel ?? 'Unknown'}`,
      `Upload date: ${record.uploadDate ?? 'Unknown'}`,
      `Duration (s): ${record.duration ?? 'Unknown'}`,
      `URL: ${record.url ?? 'Unknown'}`,
      '',
      'Description:',
      record.description ?? '(none)',
      '',
    ].join('\n');
  }

  return JSON.stringify(record, null, 2);
}

module.exports = {
  sanitizeFilename,
  buildThumbnailOutputPath,
  buildMetadataOutputPath,
  guessExtensionFromUrl,
  buildThumbnailConvertArgs,
  buildMetadataContent,
};
