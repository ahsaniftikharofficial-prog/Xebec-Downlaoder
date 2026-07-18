// Pure functions for the download history list — building an entry,
// prepending it with a cap on total size, and safely parsing whatever's on
// disk. Kept free of fs/electron so this can be unit-tested directly, same
// split as the rest of this folder.

const MAX_HISTORY_ENTRIES = 200;

function buildHistoryEntry({ id, downloadedAt, title, filePath, url, type, verified }) {
  return {
    id,
    downloadedAt,
    title: title || 'Untitled',
    filePath,
    url,
    type,
    verified: Boolean(verified),
  };
}

// Newest first; oldest entries drop off once the cap is hit rather than
// letting the file grow forever over a multi-month project.
function addEntry(historyList, entry) {
  return [entry, ...historyList].slice(0, MAX_HISTORY_ENTRIES);
}

// A missing or corrupted history file should never stop the app from
// opening or downloading — it should just start again from an empty list.
function parseHistoryFile(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

module.exports = { MAX_HISTORY_ENTRIES, buildHistoryEntry, addEntry, parseHistoryFile };
