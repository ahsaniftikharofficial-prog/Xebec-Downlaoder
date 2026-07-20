import { useState, useEffect, useRef } from 'react';
import ClipScrubber from './ClipScrubber';
import { parseTimestamp, formatTimestamp, moveClipHandle } from './clip';
import { ACCENT_COLORS, ACCENT_THEMES } from './theme';
import { cleanErrorMessage } from './errors';

function formatDuration(totalSeconds) {
  if (totalSeconds == null) return 'unknown length';
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// IDM-style human sizes: "45.2 MB", "1.3 GB" — two decimals under 10 of a
// unit, one decimal above, so the number never jitters by more digits than
// it needs to.
function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[unitIndex]}`;
}

function formatSpeed(bytesPerSecond) {
  const formatted = formatBytes(bytesPerSecond);
  return formatted ? `${formatted}/s` : null;
}

// "0:42" under an hour, "1:03:20" once it runs past one.
function formatEta(totalSeconds) {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return null;
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// Mirrors electron/playlist.js's isPlaylistUrl exactly. Kept in sync by
// hand since the renderer can't require() Node modules from electron/.
function isPlaylistUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.has('list') || parsed.pathname.includes('/playlist');
  } catch {
    return false;
  }
}

export default function App() {
  const [url, setUrl] = useState('');

  const [engineStatus, setEngineStatus] = useState(null);
  const [checkingEngine, setCheckingEngine] = useState(false);

  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  // Phase 5: clipStart/clipEnd (seconds) drive both the scrubber and the
  // download call. clipStartText/clipEndText are separate buffer state for
  // the fallback text inputs, so the user can type freely without the
  // field reformatting itself mid-keystroke — they only sync back to the
  // real seconds values on blur (see commitClipStartText/EndText below).
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(0);
  const [clipStartText, setClipStartText] = useState('0:00');
  const [clipEndText, setClipEndText] = useState('0:00');

  // Phase 2: quality/format come from this specific video's real formats
  // (info.resolutions), not a guessed generic list.
  const [quality, setQuality] = useState(''); // '' = best available
  const [format, setFormat] = useState('mp4');
  const [audioOnly, setAudioOnly] = useState(false);
  const [audioFormat, setAudioFormat] = useState('mp3');

  const [progress, setProgress] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState(null);
  const [downloadError, setDownloadError] = useState(null);

  // Phase 3: thumbnail / subtitles / metadata are each independent
  // one-click saves — none of them touch the video download above, and a
  // failure in one can't take down the others.
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [thumbnailFormat, setThumbnailFormat] = useState('jpg');
  const [savingThumbnail, setSavingThumbnail] = useState(false);
  const [thumbnailResult, setThumbnailResult] = useState(null);
  const [thumbnailError, setThumbnailError] = useState(null);

  const [selectedLangs, setSelectedLangs] = useState([]);
  const [subtitleFormat, setSubtitleFormat] = useState('srt');
  const [savingSubtitles, setSavingSubtitles] = useState(false);
  const [subtitleResult, setSubtitleResult] = useState(null);
  const [subtitleError, setSubtitleError] = useState(null);

  const [metadataFormat, setMetadataFormat] = useState('json');
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [metadataResult, setMetadataResult] = useState(null);
  const [metadataError, setMetadataError] = useState(null);

  // Phase 4: a playlist URL gets a checklist + queue instead of the
  // single-video card above. playlistInfo and info are never set at the
  // same time — handleGetInfo always clears one before fetching the other.
  const [playlistInfo, setPlaylistInfo] = useState(null);
  const [playlistError, setPlaylistError] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [queueItems, setQueueItems] = useState([]);
  const [queueRunning, setQueueRunning] = useState(false);
  const [queueError, setQueueError] = useState(null);

  // Phase 6. settings/history start from a local fallback and get replaced
  // by the real thing once the IPC calls below resolve — the fallback
  // shape must match electron/settings.js's DEFAULT_SETTINGS.
  const [settings, setSettings] = useState({ defaultFolder: null, defaultQuality: null, accentColor: 'emerald' });
  const [settingsError, setSettingsError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [clipboardSuggestion, setClipboardSuggestion] = useState(null);
  const [engineError, setEngineError] = useState(null);

  // Phase 7: notices for self-healing engine updates the user hasn't seen
  // yet — one entry per binary that updated ('yt-dlp' | 'ffmpeg'), each
  // with an Undo affordance. Kept as a small array rather than one banner
  // since yt-dlp and ffmpeg can update independently.
  const [engineUpdateNotices, setEngineUpdateNotices] = useState([]);
  const [rollingBackBinary, setRollingBackBinary] = useState(null);
  const [rollbackError, setRollbackError] = useState(null);

  // Phase 8: separate from the engine notices above — this is the app
  // itself (not yt-dlp/ffmpeg) having a new version ready to install.
  const [appUpdateNotice, setAppUpdateNotice] = useState(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);

  // yt-dlp's raw "speed" is the instantaneous rate of whatever chunk just
  // arrived — genuinely jumpy update to update. This smooths it into the
  // steady, slowly-settling number a real download manager shows, and
  // recomputes ETA from that smoothed speed (rather than yt-dlp's own raw
  // eta) so the two numbers on screen always agree with each other.
  const smoothedSpeedRef = useRef(null);

  useEffect(() => {
    const unsubscribe = window.api.onDownloadProgress((p) => {
      if (p.status === 'downloading' && p.speed != null) {
        const prev = smoothedSpeedRef.current;
        smoothedSpeedRef.current = prev == null ? p.speed : prev * 0.75 + p.speed * 0.25;
      } else if (p.status !== 'downloading') {
        smoothedSpeedRef.current = null;
      }

      const smoothedSpeed = smoothedSpeedRef.current;
      const remaining = p.totalBytes != null && p.downloadedBytes != null
        ? p.totalBytes - p.downloadedBytes
        : null;
      const smoothedEta = smoothedSpeed && remaining != null ? remaining / smoothedSpeed : p.eta;

      setProgress({ ...p, smoothedSpeed, smoothedEta });
    });
    return unsubscribe;
  }, []);

  // Per-item queue updates (status + live percent) as each playlist video
  // is downloaded in turn.
  useEffect(() => {
    const unsubscribe = window.api.onPlaylistItemUpdate((update) => {
      setQueueItems((prev) =>
        prev.map((item) =>
          item.id === update.id
            ? {
                ...item,
                status: update.status,
                percent: update.progress?.percent ?? item.percent,
                error: update.error ? cleanErrorMessage(update.error) : null,
              }
            : item
        )
      );
    });
    return unsubscribe;
  }, []);

  // Settings and history are both loaded once on launch — reading a small
  // local JSON file is cheap, so there's no real cost to doing it eagerly
  // instead of waiting for the user to open each panel.
  useEffect(() => {
    window.api.getSettings().then(setSettings).catch(() => {});
    refreshHistory();
  }, []);

  useEffect(() => {
    const unsubscribe = window.api.onClipboardDetected((text) => setClipboardSuggestion(text));
    return unsubscribe;
  }, []);

  // Builds notice entries from any unacknowledged lastUpdate in the engine
  // metadata — covers both a live update (see effect below) and one that
  // happened earlier and hasn't been dismissed yet.
  function noticesFromStatus(status) {
    const notices = [];
    if (status?.ytDlp?.lastUpdate && !status.ytDlp.lastUpdate.acknowledged) {
      notices.push({ binary: 'yt-dlp', ...status.ytDlp.lastUpdate });
    }
    if (status?.ffmpeg?.lastUpdate && !status.ffmpeg.lastUpdate.acknowledged) {
      notices.push({ binary: 'ffmpeg', ...status.ffmpeg.lastUpdate });
    }
    return notices;
  }

  useEffect(() => {
    window.api
      .getEngineUpdateStatus()
      .then((status) => setEngineUpdateNotices(noticesFromStatus(status)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = window.api.onEngineUpdated((result) => {
      setEngineUpdateNotices(noticesFromStatus(result.metadata));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = window.api.onAppUpdateReady((notice) => setAppUpdateNotice(notice));
    return unsubscribe;
  }, []);

  async function handleInstallAppUpdate() {
    setInstallingUpdate(true);
    try {
      await window.api.installAppUpdate();
      // The app quits and relaunches itself at this point — nothing else
      // to do here if it succeeds.
    } catch {
      setInstallingUpdate(false);
    }
  }

  async function handleDismissEngineNotice(binary) {
    setEngineUpdateNotices((prev) => prev.filter((n) => n.binary !== binary));
    try {
      await window.api.acknowledgeEngineUpdate(binary);
    } catch {
      // Non-critical — worst case the notice reappears next launch.
    }
  }

  async function handleRollbackEngine(binary) {
    setRollingBackBinary(binary);
    setRollbackError(null);
    try {
      await window.api.rollbackEngine(binary);
      setEngineUpdateNotices((prev) => prev.filter((n) => n.binary !== binary));
    } catch (err) {
      setRollbackError(`Couldn't roll back ${binary}: ${cleanErrorMessage(err.message)}`);
    } finally {
      setRollingBackBinary(null);
    }
  }

  async function handleCheckEngine() {
    setCheckingEngine(true);
    setEngineStatus(null);
    setEngineError(null);
    try {
      setEngineStatus(await window.api.checkEngine());
    } catch (err) {
      setEngineError(cleanErrorMessage(err.message));
    } finally {
      setCheckingEngine(false);
    }
  }

  async function refreshHistory() {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      setHistory(await window.api.getHistory());
    } catch (err) {
      setHistoryError(cleanErrorMessage(err.message));
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleClearHistory() {
    if (!window.confirm("Clear all download history? This can't be undone.")) return;
    setHistoryError(null);
    try {
      setHistory(await window.api.clearHistory());
    } catch (err) {
      setHistoryError(cleanErrorMessage(err.message));
    }
  }

  async function handleOpenHistoryFile(filePath) {
    setHistoryError(null);
    try {
      await window.api.openHistoryFile(filePath);
    } catch (err) {
      setHistoryError(cleanErrorMessage(err.message));
    }
  }

  async function applySettingsUpdate(updates) {
    setSettingsError(null);
    try {
      setSettings(await window.api.setSettings(updates));
    } catch (err) {
      setSettingsError(cleanErrorMessage(err.message));
    }
  }

  async function handleChooseFolder() {
    setSettingsError(null);
    try {
      setSettings(await window.api.chooseDownloadFolder());
    } catch (err) {
      setSettingsError(cleanErrorMessage(err.message));
    }
  }

  function handleUseClipboardLink() {
    setUrl(clipboardSuggestion);
    setClipboardSuggestion(null);
  }

  function handleDismissClipboardSuggestion() {
    setClipboardSuggestion(null);
  }

  async function handleGetInfo() {
    setLoadingInfo(true);
    setInfo(null);
    setInfoError(null);
    setQuality(''); // this video's resolutions haven't loaded yet

    // A new URL means the previous one's playlist listing/queue no longer
    // applies, same reasoning as the thumbnail/subtitle/metadata reset below.
    setPlaylistInfo(null);
    setPlaylistError(null);
    setSelectedIds(new Set());
    setQueueItems([]);
    setQueueRunning(false);

    // A new video means the previous one's thumbnail pick, subtitle
    // selection, and any leftover save results no longer apply.
    setThumbnailUrl('');
    setSelectedLangs([]);
    setThumbnailResult(null);
    setThumbnailError(null);
    setSubtitleResult(null);
    setSubtitleError(null);
    setMetadataResult(null);
    setMetadataError(null);

    if (isPlaylistUrl(url)) {
      try {
        const fetched = await window.api.getPlaylistInfo(url);
        setPlaylistInfo(fetched);
        // Select-all by default — the checklist is there for excluding a
        // few videos, not for opting every single one in by hand.
        setSelectedIds(new Set(fetched.entries.map((e) => e.id)));
      } catch (err) {
        setPlaylistError(cleanErrorMessage(err.message));
      } finally {
        setLoadingInfo(false);
      }
      return;
    }

    try {
      const fetched = await window.api.getVideoInfo(url);
      setInfo(fetched);
      // Default the picker to the best (largest) thumbnail this video has.
      setThumbnailUrl(fetched.thumbnails?.[0]?.url || fetched.thumbnail || '');
      // Apply the "default quality" setting only if this video actually
      // offers that resolution — can't force a resolution it doesn't have.
      const resolutionStrings = (fetched.resolutions || []).map(String);
      if (settings.defaultQuality && resolutionStrings.includes(settings.defaultQuality)) {
        setQuality(settings.defaultQuality);
      }
      // Default the clip range to the whole video.
      const duration = fetched.duration || 0;
      setClipStart(0);
      setClipEnd(duration);
      setClipStartText(formatTimestamp(0));
      setClipEndText(formatTimestamp(duration));
    } catch (err) {
      setInfoError(cleanErrorMessage(err.message));
    } finally {
      setLoadingInfo(false);
    }
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      playlistInfo && prev.size === playlistInfo.entries.length
        ? new Set()
        : new Set(playlistInfo.entries.map((e) => e.id))
    );
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Downloads every checked item one at a time via the same downloadVideo()
  // Phase 1 built — verification and resume come along for free. A failed
  // item is reported in that row and the queue moves on; see playlist.js's
  // processQueue for where that isolation actually happens.
  async function submitPlaylistDownload(items) {
    setQueueRunning(true);
    setQueueError(null);
    try {
      await window.api.downloadPlaylist({ items });
      refreshHistory();
    } catch (err) {
      setQueueError(cleanErrorMessage(err.message));
    } finally {
      setQueueRunning(false);
    }
  }

  async function handleDownloadPlaylist() {
    const items = playlistInfo.entries
      .filter((e) => selectedIds.has(e.id))
      .map((e) => ({ id: e.id, url: e.url, title: e.title }));

    setQueueItems(items.map((e) => ({ id: e.id, title: e.title, status: 'pending', percent: null, error: null })));
    await submitPlaylistDownload(items);
  }

  // Re-runs just the items that failed last time, leaving the successful
  // rows in the queue list as they are — no need to reselect everything
  // from the checklist just to pick up the few that didn't make it.
  async function handleRetryFailed() {
    const failedIds = new Set(queueItems.filter((i) => i.status === 'failed').map((i) => i.id));
    const items = playlistInfo.entries
      .filter((e) => failedIds.has(e.id))
      .map((e) => ({ id: e.id, url: e.url, title: e.title }));

    setQueueItems((prev) =>
      prev.map((item) => (failedIds.has(item.id) ? { ...item, status: 'pending', percent: null, error: null } : item))
    );
    await submitPlaylistDownload(items);
  }

  async function handleSaveThumbnail() {
    setSavingThumbnail(true);
    setThumbnailResult(null);
    setThumbnailError(null);
    try {
      const res = await window.api.downloadThumbnail({
        thumbnailUrl,
        title: info.title,
        id: info.id,
        format: thumbnailFormat,
      });
      setThumbnailResult(res);
    } catch (err) {
      setThumbnailError(cleanErrorMessage(err.message));
    } finally {
      setSavingThumbnail(false);
    }
  }

  function toggleLang(code) {
    setSelectedLangs((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  async function handleSaveSubtitles() {
    setSavingSubtitles(true);
    setSubtitleResult(null);
    setSubtitleError(null);
    try {
      const res = await window.api.downloadSubtitles({
        url,
        id: info.id,
        langs: selectedLangs,
        format: subtitleFormat,
      });
      setSubtitleResult(res);
    } catch (err) {
      setSubtitleError(cleanErrorMessage(err.message));
    } finally {
      setSavingSubtitles(false);
    }
  }

  async function handleSaveMetadata() {
    setSavingMetadata(true);
    setMetadataResult(null);
    setMetadataError(null);
    try {
      const res = await window.api.saveMetadata({ info, format: metadataFormat });
      setMetadataResult(res);
    } catch (err) {
      setMetadataError(cleanErrorMessage(err.message));
    } finally {
      setSavingMetadata(false);
    }
  }

  async function handleDownload(section) {
    setDownloading(true);
    setProgress(null);
    smoothedSpeedRef.current = null;
    setResult(null);
    setDownloadError(null);
    try {
      const res = await window.api.downloadVideo({
        url,
        title: info?.title,
        section,
        quality: audioOnly || !quality ? null : Number(quality),
        format,
        audioOnly,
        audioFormat,
      });
      setResult(res);
      refreshHistory();
    } catch (err) {
      setDownloadError(cleanErrorMessage(err.message));
    } finally {
      setDownloading(false);
    }
  }

  // Called continuously while dragging either scrubber handle.
  function handleClipRangeChange({ start: nextStart, end: nextEnd }) {
    setClipStart(nextStart);
    setClipEnd(nextEnd);
    setClipStartText(formatTimestamp(nextStart));
    setClipEndText(formatTimestamp(nextEnd));
  }

  // Typing a timestamp doesn't move anything until you click away — that's
  // what lets someone type "1" then "1:" then "1:23" without the field
  // fighting them on every keystroke. Invalid text just reverts to the
  // last valid value instead of erroring.
  function commitClipStartText() {
    const parsed = parseTimestamp(clipStartText);
    const { start: nextStart } = moveClipHandle({
      which: 'start',
      time: parsed == null ? clipStart : parsed,
      start: clipStart,
      end: clipEnd,
      duration: info.duration || 0,
    });
    setClipStart(nextStart);
    setClipStartText(formatTimestamp(nextStart));
  }

  function commitClipEndText() {
    const parsed = parseTimestamp(clipEndText);
    const { end: nextEnd } = moveClipHandle({
      which: 'end',
      time: parsed == null ? clipEnd : parsed,
      start: clipStart,
      end: clipEnd,
      duration: info.duration || 0,
    });
    setClipEnd(nextEnd);
    setClipEndText(formatTimestamp(nextEnd));
  }

  const percent = progress?.percent != null ? Math.round(progress.percent) : null;

  // Playlist links (a /playlist page, or a watch link with &list=) get the
  // checklist below instead of the single-video download controls further
  // down — those controls only make sense for exactly one video.
  const isPlaylist = isPlaylistUrl(url);
  const queueDone = queueItems.filter((i) => i.status === 'done' || i.status === 'failed').length;
  const queueSucceeded = queueItems.filter((i) => i.status === 'done').length;
  const queueFailed = queueItems.filter((i) => i.status === 'failed').length;
  const queueOverallPercent = queueItems.length ? Math.round((queueDone / queueItems.length) * 100) : 0;
  const accent = ACCENT_THEMES[settings.accentColor] || ACCENT_THEMES.emerald;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Xebec Downloader</h1>

      <div className="w-full max-w-md flex flex-col items-center gap-2">
        <div className="flex gap-2 w-full">
          <button
            onClick={handleCheckEngine}
            disabled={checkingEngine}
            className="flex-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-sm px-4 py-2"
          >
            {checkingEngine ? 'Checking…' : 'Check Engine'}
          </button>
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="flex-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm px-4 py-2"
          >
            History
          </button>
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="flex-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm px-4 py-2"
          >
            Settings
          </button>
        </div>

        {/* Phase 8: the app itself has a downloaded, verified update ready
            to install — separate from Phase 7's engine notices below. */}
        {appUpdateNotice && (
          <div className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 flex items-center gap-2 text-xs">
            <span className="flex-1 text-neutral-300">
              {'\ud83d\ude80'} Update ready{appUpdateNotice.version ? ` — v${appUpdateNotice.version}` : ''}
            </span>
            <button
              onClick={handleInstallAppUpdate}
              disabled={installingUpdate}
              className={`shrink-0 rounded px-2 py-1 text-neutral-950 font-medium disabled:opacity-50 ${accent.solid}`}
            >
              {installingUpdate ? 'Restarting…' : 'Restart Now'}
            </button>
            <button
              onClick={() => setAppUpdateNotice(null)}
              className="shrink-0 text-neutral-500 hover:text-neutral-300 px-1"
              aria-label="Dismiss"
            >
              {'\u2715'}
            </button>
          </div>
        )}

        {/* Phase 7: small, unobtrusive notice when the self-healing engine
            actually updated something — silent otherwise. Each has its own
            Undo, since yt-dlp and ffmpeg update independently. */}
        {engineUpdateNotices.map((notice) => (
          <div
            key={notice.binary}
            className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 flex items-center gap-2 text-xs"
          >
            <span className="flex-1 text-neutral-300">
              {'\u2b06\ufe0f'} {notice.binary} updated ({notice.previousVersion} {'\u2192'} {notice.newVersion})
            </span>
            <button
              onClick={() => handleRollbackEngine(notice.binary)}
              disabled={rollingBackBinary === notice.binary}
              className="shrink-0 text-neutral-400 hover:text-neutral-200 disabled:opacity-50 px-1"
            >
              {rollingBackBinary === notice.binary ? 'Undoing…' : 'Undo'}
            </button>
            <button
              onClick={() => handleDismissEngineNotice(notice.binary)}
              className="shrink-0 text-neutral-500 hover:text-neutral-300 px-1"
              aria-label="Dismiss"
            >
              {'\u2715'}
            </button>
          </div>
        ))}
        {rollbackError && <p className="text-red-400 text-xs">{rollbackError}</p>}

        {engineError && <p className="text-red-400 text-xs">{engineError}</p>}
        {engineStatus && (
          <div className="w-full rounded-lg bg-neutral-900 border border-neutral-800 p-3 text-xs font-mono">
            <div>yt-dlp: {engineStatus.ytDlp ?? `\u274c ${engineStatus.ytDlpError}`}</div>
            <div>ffmpeg: {engineStatus.ffmpeg ?? `\u274c ${engineStatus.ffmpegError}`}</div>
            <div>deno: {engineStatus.deno ?? `\u274c ${engineStatus.denoError}`}</div>
          </div>
        )}

        {showHistory && (
          <div className="w-full rounded-lg bg-neutral-900 border border-neutral-800 p-3 flex flex-col gap-2 text-xs">
            {historyError && <p className="text-red-400">{historyError}</p>}
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">{history.length} download{history.length === 1 ? '' : 's'}</span>
              <button
                onClick={handleClearHistory}
                disabled={history.length === 0}
                className="text-red-400 hover:text-red-300 disabled:opacity-50 disabled:hover:text-red-400"
              >
                Clear history
              </button>
            </div>
            {loadingHistory ? (
              <p className="text-neutral-500">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-neutral-500">Nothing downloaded yet.</p>
            ) : (
              <div className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-1">
                {history.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => handleOpenHistoryFile(entry.filePath)}
                    className="flex items-center justify-between gap-2 text-left hover:bg-neutral-800 rounded-lg px-2 py-1.5 -mx-2"
                  >
                    <span className="truncate flex-1 text-neutral-300">{entry.title}</span>
                    <span className="text-neutral-500 shrink-0">
                      {entry.type === 'clip' ? 'Clip' : entry.type === 'playlist-item' ? 'Playlist' : 'Video'}
                      {entry.verified ? '' : ' \u26a0\ufe0f'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {showSettings && (
          <div className="w-full rounded-lg bg-neutral-900 border border-neutral-800 p-3 flex flex-col gap-3 text-xs">
            {settingsError && <p className="text-red-400">{settingsError}</p>}

            <div className="flex flex-col gap-1">
              <span className="text-neutral-400">Download folder</span>
              <div className="flex items-center gap-2">
                <span className="truncate flex-1 text-neutral-300">
                  {settings.defaultFolder || 'System default (Downloads)'}
                </span>
                <button
                  onClick={handleChooseFolder}
                  className="rounded-lg bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 shrink-0"
                >
                  Choose…
                </button>
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-neutral-400">Default quality</span>
              <select
                value={settings.defaultQuality || ''}
                onChange={(e) => applySettingsUpdate({ defaultQuality: e.target.value || null })}
                className="rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2"
              >
                <option value="">Best available</option>
                <option value="2160">2160p (4K)</option>
                <option value="1440">1440p</option>
                <option value="1080">1080p</option>
                <option value="720">720p</option>
                <option value="480">480p</option>
                <option value="360">360p</option>
              </select>
            </label>

            <div className="flex flex-col gap-1">
              <span className="text-neutral-400">Accent color</span>
              <div className="flex gap-2">
                {ACCENT_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => applySettingsUpdate({ accentColor: color })}
                    aria-label={color}
                    className={`w-6 h-6 rounded-full ${ACCENT_THEMES[color].swatch} ${
                      settings.accentColor === color
                        ? 'ring-2 ring-offset-2 ring-offset-neutral-900 ring-neutral-100'
                        : ''
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-md flex flex-col gap-3">
        {clipboardSuggestion && (
          <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-2 flex items-center gap-2 text-xs">
            <span className="truncate flex-1 text-neutral-300">
              Found a link in your clipboard: {clipboardSuggestion}
            </span>
            <button
              onClick={handleUseClipboardLink}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-neutral-950 font-medium ${accent.solid}`}
            >
              Use it
            </button>
            <button
              onClick={handleDismissClipboardSuggestion}
              className="shrink-0 text-neutral-500 hover:text-neutral-300 px-2"
            >
              {'\u2715'}
            </button>
          </div>
        )}

        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube URL"
          className={`rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-2 text-sm focus:outline-none focus:ring-2 ${accent.ring}`}
        />

        <button
          onClick={handleGetInfo}
          disabled={!url || loadingInfo}
          className="rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-sm px-4 py-2"
        >
          {loadingInfo ? 'Fetching info…' : 'Get Info'}
        </button>

        {infoError && <p className="text-red-400 text-xs">{infoError}</p>}
        {playlistError && <p className="text-red-400 text-xs">{playlistError}</p>}

        {playlistInfo && (
          <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 flex flex-col gap-2">
            <div className="font-medium text-xs">{playlistInfo.title}</div>
            <div className="text-neutral-400 text-xs">{playlistInfo.entries.length} videos</div>

            <label className="flex items-center gap-2 text-xs text-neutral-300 font-medium border-t border-neutral-800 pt-2">
              <input
                type="checkbox"
                checked={selectedIds.size === playlistInfo.entries.length && playlistInfo.entries.length > 0}
                onChange={toggleSelectAll}
              />
              Select all ({selectedIds.size}/{playlistInfo.entries.length})
            </label>

            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-1">
              {playlistInfo.entries.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-xs text-neutral-300">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(e.id)}
                    onChange={() => toggleSelected(e.id)}
                  />
                  <span className="truncate flex-1">{e.title}</span>
                  <span className="text-neutral-500 shrink-0">{formatDuration(e.duration)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {playlistInfo && (
          <button
            onClick={handleDownloadPlaylist}
            disabled={selectedIds.size === 0 || queueRunning}
            className={`rounded-lg ${accent.solid} disabled:opacity-50 text-neutral-950 font-medium px-4 py-2 text-sm`}
          >
            {queueRunning
              ? `Downloading… (${queueDone}/${queueItems.length})`
              : `Download Selected (${selectedIds.size})`}
          </button>
        )}

        {queueError && <p className="text-red-400 text-xs">{queueError}</p>}

        {queueItems.length > 0 && (
          <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 flex flex-col gap-2">
            <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className={`h-full ${accent.fill} transition-all`}
                style={{ width: `${queueOverallPercent}%` }}
              />
            </div>
            <p className="text-xs text-neutral-500">
              {queueDone}/{queueItems.length} processed — {queueSucceeded} succeeded, {queueFailed} failed
            </p>

            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-1">
              {queueItems.map((item) => (
                <div key={item.id} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-neutral-300">
                    <span className="truncate flex-1">{item.title}</span>
                    <span className="text-neutral-400 shrink-0">
                      {item.status === 'pending' && 'Waiting…'}
                      {item.status === 'downloading' && (item.percent != null ? `${Math.round(item.percent)}%` : '…')}
                      {item.status === 'done' && '\u2705'}
                      {item.status === 'failed' && '\u274c'}
                    </span>
                  </div>
                  {item.status === 'failed' && item.error && (
                    <p className="text-red-400 text-xs truncate">{item.error}</p>
                  )}
                </div>
              ))}
            </div>

            {!queueRunning && queueFailed > 0 && (
              <button
                onClick={handleRetryFailed}
                className="rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm px-4 py-2"
              >
                Retry Failed ({queueFailed})
              </button>
            )}
          </div>
        )}

        {info && (
          <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 text-xs">
            <div className="font-medium">{info.title}</div>
            <div className="text-neutral-400">{formatDuration(info.duration)}</div>
          </div>
        )}

        {info && (
          <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs text-neutral-300">
              <input
                type="checkbox"
                checked={audioOnly}
                onChange={(e) => setAudioOnly(e.target.checked)}
              />
              Audio only
            </label>

            {audioOnly ? (
              <select
                value={audioFormat}
                onChange={(e) => setAudioFormat(e.target.value)}
                className="rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
              >
                <option value="mp3">MP3</option>
                <option value="m4a">M4A</option>
                <option value="wav">WAV</option>
              </select>
            ) : (
              <div className="flex gap-2">
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  className="w-1/2 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
                >
                  <option value="">Best available</option>
                  {info.resolutions.map((r) => (
                    <option key={r} value={r}>{r}p</option>
                  ))}
                </select>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-1/2 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
                >
                  <option value="mp4">MP4</option>
                  <option value="mkv">MKV</option>
                  <option value="webm">WEBM</option>
                </select>
              </div>
            )}
          </div>
        )}

        {!isPlaylist && (
          <button
            onClick={() => handleDownload(null)}
            disabled={!url || downloading}
            className={`rounded-lg ${accent.solid} disabled:opacity-50 text-neutral-950 font-medium px-4 py-2 text-sm`}
          >
            {downloading
              ? 'Downloading…'
              : audioOnly
                ? `Download Audio (${audioFormat.toUpperCase()})`
                : quality
                  ? `Download ${quality}p`
                  : 'Download Best Quality'}
          </button>
        )}

        {!isPlaylist && info && info.duration > 0 && (
          <div className="border-t border-neutral-800 pt-3 flex flex-col gap-2">
            <p className="text-xs text-neutral-500">
              Drag the handles to pick a clip, or type exact times below.
            </p>

            <ClipScrubber
              duration={info.duration}
              start={clipStart}
              end={clipEnd}
              onChange={handleClipRangeChange}
              accent={accent}
            />

            <div className="flex items-center justify-between text-xs text-neutral-500 -mt-2">
              <span>0:00</span>
              <span>{formatDuration(info.duration)}</span>
            </div>

            <div className="flex gap-2">
              <label className="w-1/2 flex flex-col gap-1 text-xs text-neutral-400">
                Start
                <input
                  value={clipStartText}
                  onChange={(e) => setClipStartText(e.target.value)}
                  onBlur={commitClipStartText}
                  className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
                />
              </label>
              <label className="w-1/2 flex flex-col gap-1 text-xs text-neutral-400">
                End
                <input
                  value={clipEndText}
                  onChange={(e) => setClipEndText(e.target.value)}
                  onBlur={commitClipEndText}
                  className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <p className="text-xs text-neutral-500">
              Clip length: {formatTimestamp(clipEnd - clipStart)}
            </p>

            <button
              onClick={() => handleDownload({ start: clipStart, end: clipEnd })}
              disabled={!url || downloading || clipEnd <= clipStart}
              className="rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-sm px-4 py-2"
            >
              Download Clip ({formatTimestamp(clipEnd - clipStart)})
            </button>
          </div>
        )}

        {!isPlaylist && info && !info.duration && (
          <p className="text-xs text-neutral-500 border-t border-neutral-800 pt-3">
            Clip selection isn't available for this video (unknown or live length).
          </p>
        )}

        {progress && (
          <div className="w-full flex flex-col gap-1.5">
            <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className={`h-full ${accent.fill} transition-[width] duration-200 ease-out ${
                  percent == null ? 'animate-pulse opacity-60' : ''
                }`}
                style={{ width: `${percent ?? 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-neutral-500 font-mono tabular-nums">
              <span>
                {progress.status === 'finished'
                  ? 'Finishing up…'
                  : percent != null ? `${percent}%` : 'Downloading…'}
              </span>
              {progress.status === 'downloading' && (
                <span className="flex gap-3">
                  {progress.smoothedSpeed != null && <span>{formatSpeed(progress.smoothedSpeed)}</span>}
                  {progress.smoothedEta != null && <span>{formatEta(progress.smoothedEta)} left</span>}
                </span>
              )}
            </div>
            {progress.status === 'downloading' && progress.downloadedBytes != null && (
              <p className="text-xs text-neutral-600 text-right font-mono tabular-nums">
                {formatBytes(progress.downloadedBytes)}
                {progress.totalBytes != null && ` / ${formatBytes(progress.totalBytes)}`}
              </p>
            )}
          </div>
        )}

        {downloadError && <p className="text-red-400 text-xs">{downloadError}</p>}
        {result && (
          <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 text-xs font-mono">
            <div>{result.verified ? '\u2705 Verified' : '\u26a0\ufe0f Finished but not verified'}</div>
            <div className="truncate">{result.filePath}</div>
          </div>
        )}

        {info && (
          <div className="border-t border-neutral-800 pt-3 flex flex-col gap-4">
            <p className="text-xs text-neutral-500">
              Extras — thumbnail, subtitles, and metadata each save on their
              own, independent of the video download above.
            </p>

            <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 flex flex-col gap-2">
              <div className="text-xs font-medium text-neutral-300">Thumbnail</div>
              {thumbnailUrl && (
                <img
                  src={thumbnailUrl}
                  alt="Thumbnail preview"
                  className="rounded-md max-h-32 w-full object-cover"
                />
              )}
              <div className="flex gap-2">
                <select
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  className="w-2/3 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
                >
                  {info.thumbnails.map((t, i) => (
                    <option key={t.url} value={t.url}>
                      {i === 0 ? 'Best — ' : ''}
                      {t.width && t.height ? `${t.width}\u00d7${t.height}` : 'Unknown size'}
                    </option>
                  ))}
                </select>
                <select
                  value={thumbnailFormat}
                  onChange={(e) => setThumbnailFormat(e.target.value)}
                  className="w-1/3 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
                >
                  <option value="jpg">JPG</option>
                  <option value="png">PNG</option>
                </select>
              </div>
              <button
                onClick={handleSaveThumbnail}
                disabled={!thumbnailUrl || savingThumbnail}
                className="rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-sm px-4 py-2"
              >
                {savingThumbnail ? 'Saving…' : 'Save Thumbnail'}
              </button>
              {thumbnailError && <p className="text-red-400 text-xs">{thumbnailError}</p>}
              {thumbnailResult && (
                <div className="text-xs font-mono">
                  <div>
                    {thumbnailResult.verified ? '\u2705 Verified' : '\u26a0\ufe0f Saved but not verified'}
                    {thumbnailResult.width ? ` (${thumbnailResult.width}\u00d7${thumbnailResult.height})` : ''}
                  </div>
                  <div className="truncate text-neutral-400">{thumbnailResult.filePath}</div>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 flex flex-col gap-2">
              <div className="text-xs font-medium text-neutral-300">Subtitles</div>
              {info.subtitleTracks.length === 0 ? (
                <p className="text-xs text-neutral-500">No subtitle tracks available for this video.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                    {info.subtitleTracks.map((t) => (
                      <label key={t.code} className="flex items-center gap-2 text-xs text-neutral-300">
                        <input
                          type="checkbox"
                          checked={selectedLangs.includes(t.code)}
                          onChange={() => toggleLang(t.code)}
                        />
                        {t.name} ({t.code}){t.auto ? ' \u2014 auto-generated' : ''}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={subtitleFormat}
                      onChange={(e) => setSubtitleFormat(e.target.value)}
                      className="w-1/2 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
                    >
                      <option value="srt">SRT</option>
                      <option value="vtt">VTT</option>
                    </select>
                    <button
                      onClick={handleSaveSubtitles}
                      disabled={selectedLangs.length === 0 || savingSubtitles}
                      className="w-1/2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-sm px-4 py-2"
                    >
                      {savingSubtitles ? 'Saving…' : 'Save Subtitles'}
                    </button>
                  </div>
                </>
              )}
              {subtitleError && <p className="text-red-400 text-xs">{subtitleError}</p>}
              {subtitleResult && (
                <div className="text-xs font-mono">
                  {subtitleResult.succeeded.length > 0 && (
                    <div>{'\u2705'} Saved: {subtitleResult.succeeded.join(', ')}</div>
                  )}
                  {subtitleResult.failed.length > 0 && (
                    <div className="text-amber-400">{'\u26a0\ufe0f'} Not available: {subtitleResult.failed.join(', ')}</div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 flex flex-col gap-2">
              <div className="text-xs font-medium text-neutral-300">Metadata</div>
              <div className="text-xs text-neutral-400 flex flex-col gap-0.5">
                <div>Channel: {info.channel || 'Unknown'}</div>
                <div>Uploaded: {info.uploadDate || 'Unknown'}</div>
                {info.description && (
                  <div className="line-clamp-3 text-neutral-500">{info.description}</div>
                )}
              </div>
              <div className="flex gap-2">
                <select
                  value={metadataFormat}
                  onChange={(e) => setMetadataFormat(e.target.value)}
                  className="w-1/2 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
                >
                  <option value="json">JSON</option>
                  <option value="txt">TXT</option>
                </select>
                <button
                  onClick={handleSaveMetadata}
                  disabled={savingMetadata}
                  className="w-1/2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-sm px-4 py-2"
                >
                  {savingMetadata ? 'Saving…' : 'Save Metadata'}
                </button>
              </div>
              {metadataError && <p className="text-red-400 text-xs">{metadataError}</p>}
              {metadataResult && (
                <div className="text-xs font-mono">
                  <div>{metadataResult.verified ? '\u2705 Verified' : '\u26a0\ufe0f Saved but not verified'}</div>
                  <div className="truncate text-neutral-400">{metadataResult.filePath}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
