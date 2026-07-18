// Pure check for whether a piece of clipboard text looks like a YouTube
// link — playlist or single video doesn't matter here, the app's own Get
// Info flow sorts that out afterward. Kept separate from the actual
// clipboard reading (in main.js) so it can be unit-tested directly.
function isYouTubeUrl(text) {
  try {
    const parsed = new URL(String(text).trim());
    const host = parsed.hostname.replace(/^www\.|^m\./, '');
    return host === 'youtube.com' || host === 'youtu.be';
  } catch {
    return false;
  }
}

module.exports = { isYouTubeUrl };
