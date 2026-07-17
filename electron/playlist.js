// Pure functions for playlist support: detecting a playlist URL, building
// the yt-dlp args for a fast (non-per-video) listing, parsing that listing
// into the entries the checklist needs, and running the download queue.
// Kept free of any spawn/process logic, same reasoning as ytdlp.js — all of
// this can be unit-tested without needing the real yt-dlp binary.

// A URL counts as a playlist if it has a `list=` param (this also covers
// "watch a video that's part of a playlist" links — yt-dlp's own default
// behavior for those is to treat the whole playlist as the target) or if
// it's a bare /playlist page.
function isPlaylistUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.has('list') || parsed.pathname.includes('/playlist');
  } catch {
    return false;
  }
}

// --flat-playlist lists every video's id/title/duration without yt-dlp
// fully resolving each one individually — the difference between this
// returning instantly and taking as long as downloading the whole playlist
// would.
function buildPlaylistInfoArgs(url) {
  return ['-J', '--flat-playlist', '--no-warnings', url];
}

// Playlists can contain private/deleted entries with no usable id — those
// are dropped here rather than shown as a checklist item that could only
// ever fail. The watch URL is always rebuilt from the id ourselves rather
// than trusting entry.url, since what yt-dlp puts there has varied across
// versions.
function parsePlaylistInfo(jsonText) {
  const data = JSON.parse(jsonText);
  const rawEntries = Array.isArray(data.entries) ? data.entries : [];

  const entries = rawEntries
    .filter((e) => e && e.id)
    .map((e) => ({
      id: e.id,
      title: e.title || e.id,
      duration: Number.isFinite(e.duration) ? e.duration : null,
      url: `https://www.youtube.com/watch?v=${e.id}`,
    }));

  return {
    title: data.title || 'Playlist',
    id: data.id || null,
    entries,
  };
}

// Runs the selected items one at a time rather than in parallel — simpler
// to reason about, and gentler on YouTube than firing off many requests at
// once. Whatever happens to one item (success or failure), the loop always
// moves on to the next; that's what "one broken video doesn't take the
// other 49 down with it" means in code. downloadItem is injected so this
// can be unit-tested without a real yt-dlp binary — playlistManager.js is
// the only caller that passes the real one.
async function processQueue({ items, downloadItem, onItemUpdate }) {
  const results = [];

  for (const item of items) {
    if (onItemUpdate) onItemUpdate(item.id, { status: 'downloading' });

    try {
      const result = await downloadItem(item, (progress) => {
        if (onItemUpdate) onItemUpdate(item.id, { status: 'downloading', progress });
      });
      if (onItemUpdate) onItemUpdate(item.id, { status: 'done', result });
      results.push({ id: item.id, status: 'done', result });
    } catch (err) {
      if (onItemUpdate) onItemUpdate(item.id, { status: 'failed', error: err.message });
      results.push({ id: item.id, status: 'failed', error: err.message });
    }
  }

  return results;
}

module.exports = {
  isPlaylistUrl,
  buildPlaylistInfoArgs,
  parsePlaylistInfo,
  processQueue,
};
