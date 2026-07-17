import { useState, useEffect } from 'react';

function formatDuration(totalSeconds) {
  if (totalSeconds == null) return 'unknown length';
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
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

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

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

  useEffect(() => {
    const unsubscribe = window.api.onDownloadProgress((p) => setProgress(p));
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
                error: update.error ?? null,
              }
            : item
        )
      );
    });
    return unsubscribe;
  }, []);

  async function handleCheckEngine() {
    setCheckingEngine(true);
    setEngineStatus(null);
    try {
      setEngineStatus(await window.api.checkEngine());
    } finally {
      setCheckingEngine(false);
    }
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
        setPlaylistError(err.message);
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
    } catch (err) {
      setInfoError(err.message);
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
  async function handleDownloadPlaylist() {
    const items = playlistInfo.entries
      .filter((e) => selectedIds.has(e.id))
      .map((e) => ({ id: e.id, url: e.url, title: e.title }));

    setQueueItems(items.map((e) => ({ id: e.id, title: e.title, status: 'pending', percent: null, error: null })));
    setQueueRunning(true);
    try {
      await window.api.downloadPlaylist({ items });
    } finally {
      setQueueRunning(false);
    }
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
      setThumbnailError(err.message);
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
      setSubtitleError(err.message);
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
      setMetadataError(err.message);
    } finally {
      setSavingMetadata(false);
    }
  }

  async function handleDownload(section) {
    setDownloading(true);
    setProgress(null);
    setResult(null);
    setDownloadError(null);
    try {
      const res = await window.api.downloadVideo({
        url,
        section,
        quality: audioOnly || !quality ? null : Number(quality),
        format,
        audioOnly,
        audioFormat,
      });
      setResult(res);
    } catch (err) {
      setDownloadError(err.message);
    } finally {
      setDownloading(false);
    }
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

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">YT Downloader</h1>

      <div className="w-full max-w-md flex flex-col items-center gap-2">
        <button
          onClick={handleCheckEngine}
          disabled={checkingEngine}
          className="rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-sm px-4 py-2"
        >
          {checkingEngine ? 'Checking engine…' : 'Check Engine'}
        </button>
        {engineStatus && (
          <div className="w-full rounded-lg bg-neutral-900 border border-neutral-800 p-3 text-xs font-mono">
            <div>yt-dlp: {engineStatus.ytDlp ?? `\u274c ${engineStatus.ytDlpError}`}</div>
            <div>ffmpeg: {engineStatus.ffmpeg ?? `\u274c ${engineStatus.ffmpegError}`}</div>
          </div>
        )}
      </div>

      <div className="w-full max-w-md flex flex-col gap-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube URL"
          className="rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
            className="rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-neutral-950 font-medium px-4 py-2 text-sm"
          >
            {queueRunning
              ? `Downloading… (${queueDone}/${queueItems.length})`
              : `Download Selected (${selectedIds.size})`}
          </button>
        )}

        {queueItems.length > 0 && (
          <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 flex flex-col gap-2">
            <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
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
            className="rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-neutral-950 font-medium px-4 py-2 text-sm"
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

        {!isPlaylist && (
          <div className="border-t border-neutral-800 pt-3 flex flex-col gap-2">
            <p className="text-xs text-neutral-500">
              Section download prototype — plain inputs for now. The real
              drag-to-select scrubber comes in Phase 5.
            </p>
            <div className="flex gap-2">
              <input
                value={start}
                onChange={(e) => setStart(e.target.value)}
                placeholder="Start (sec)"
                className="w-1/2 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
              <input
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                placeholder="End (sec)"
                className="w-1/2 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={() => handleDownload({ start: Number(start), end: Number(end) })}
              disabled={!url || !start || !end || downloading}
              className="rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-sm px-4 py-2"
            >
              Download Section (prototype)
            </button>
          </div>
        )}

        {progress && (
          <div className="w-full">
            <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${percent ?? 0}%` }}
              />
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              {progress.status === 'finished' ? 'Finishing up…' : `${percent ?? '?'}%`}
            </p>
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
