// Pure helpers behind the app's own auto-update (Phase 8) — separate from
// Phase 7's engine self-healing (which updates yt-dlp/ffmpeg, not the app
// itself). electron-updater owns all the actual checking, downloading, and
// signature verification against the GitHub release feed; this just shapes
// its events into something simple for the renderer, and adds one small
// defensive check of its own.

const { isNewerVersion } = require('./updater');

// electron-updater emits several events during a check; only
// 'update-downloaded' (there's something ready to install) and 'error'
// are worth ever surfacing to the user — 'checking-for-update',
// 'update-available' (before the download finishes), and
// 'update-not-available' are all silent, on purpose, matching Phase 7's
// "only speak up when something actually changed" philosophy.
function buildUpdateNotice(eventName, payload) {
  if (eventName === 'update-downloaded') {
    return { status: 'ready', version: payload?.version || null };
  }
  if (eventName === 'error') {
    return { status: 'error', message: payload?.message || 'Update check failed.' };
  }
  return null;
}

// electron-updater already only downloads genuinely newer releases, but
// this is a cheap second check before ever showing the "restart to
// update" banner — belt-and-suspenders against a stray/misconfigured
// release ever prompting a downgrade.
function isMeaningfulUpdate(currentVersion, downloadedVersion) {
  if (!downloadedVersion) return false;
  return isNewerVersion(currentVersion, downloadedVersion);
}

module.exports = { buildUpdateNotice, isMeaningfulUpdate };
