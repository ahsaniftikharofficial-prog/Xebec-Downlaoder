import { useState, useEffect } from 'react';

function formatDuration(totalSeconds) {
  if (totalSeconds == null) return 'unknown length';
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
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

  const [progress, setProgress] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState(null);
  const [downloadError, setDownloadError] = useState(null);

  useEffect(() => {
    const unsubscribe = window.api.onDownloadProgress((p) => setProgress(p));
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
    try {
      setInfo(await window.api.getVideoInfo(url));
    } catch (err) {
      setInfoError(err.message);
    } finally {
      setLoadingInfo(false);
    }
  }

  async function handleDownload(section) {
    setDownloading(true);
    setProgress(null);
    setResult(null);
    setDownloadError(null);
    try {
      const res = await window.api.downloadVideo({ url, section });
      setResult(res);
    } catch (err) {
      setDownloadError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  const percent = progress?.percent != null ? Math.round(progress.percent) : null;

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
        {info && (
          <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 text-xs">
            <div className="font-medium">{info.title}</div>
            <div className="text-neutral-400">{formatDuration(info.duration)}</div>
          </div>
        )}

        <button
          onClick={() => handleDownload(null)}
          disabled={!url || downloading}
          className="rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-neutral-950 font-medium px-4 py-2 text-sm"
        >
          {downloading ? 'Downloading…' : 'Download Best Quality'}
        </button>

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
      </div>
    </div>
  );
}
