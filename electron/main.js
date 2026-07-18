const { app, BrowserWindow, ipcMain, clipboard, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { getBinPath, firstLine, runBinary } = require('./engine');
const { getVideoInfo, downloadVideo } = require('./downloadManager');
const { downloadThumbnail, downloadSubtitles, saveMetadata } = require('./assetManager');
const { getPlaylistInfo, downloadPlaylist } = require('./playlistManager');
const { readHistory, addToHistory, clearHistory } = require('./historyManager');
const { buildHistoryEntry } = require('./history');
const { readSettings, updateSettings } = require('./settingsManager');
const { isYouTubeUrl } = require('./clipboard');

const isDev = process.env.NODE_ENV === 'development';
const projectRoot = path.join(__dirname, '..');

let mainWindow;

function resourcesRoot() {
  return isDev ? projectRoot : process.resourcesPath;
}

// Settings/history live in Electron's per-user app-data folder — not the
// project folder, so they survive app updates and don't get wiped by
// re-running npm install.
const settingsFilePath = path.join(app.getPath('userData'), 'settings.json');
const historyFilePath = path.join(app.getPath('userData'), 'history.json');

async function getDownloadsDir() {
  const settings = await readSettings(settingsFilePath);
  return settings.defaultFolder || app.getPath('downloads');
}

// Checked on launch and whenever the window regains focus (the moment
// right after someone copies a link in their browser and alt-tabs back).
// lastNotifiedClipboardText stops the same link from re-prompting every
// single time the window refocuses.
let lastNotifiedClipboardText = null;
function checkClipboardForYouTubeLink() {
  let text;
  try {
    text = clipboard.readText();
  } catch {
    return; // clipboard access can fail on some platforms — just skip it
  }
  if (!text || text === lastNotifiedClipboardText || !isYouTubeUrl(text)) return;

  lastNotifiedClipboardText = text;
  if (mainWindow) mainWindow.webContents.send('clipboard:detected', text);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(projectRoot, 'dist', 'index.html'));
  }

  // did-finish-load (not called directly here) guarantees the React side
  // has mounted and registered its listener before we send anything —
  // sending earlier would fire into empty air with nothing listening yet.
  mainWindow.webContents.once('did-finish-load', checkClipboardForYouTubeLink);
  mainWindow.on('focus', checkClipboardForYouTubeLink);
}

// Phase 0's one real feature: prove the app can find and run the bundled
// yt-dlp and ffmpeg binaries, and report back what it found.
ipcMain.handle('engine:check', async () => {
  const root = resourcesRoot();
  const result = {};

  try {
    const ytDlpPath = getBinPath(root, isDev, 'yt-dlp.exe');
    result.ytDlp = await runBinary(ytDlpPath, ['--version']);
  } catch (err) {
    result.ytDlpError = err.message;
  }

  try {
    const ffmpegPath = getBinPath(root, isDev, 'ffmpeg.exe');
    const output = await runBinary(ffmpegPath, ['-version']);
    result.ffmpeg = firstLine(output);
  } catch (err) {
    result.ffmpegError = err.message;
  }

  return result;
});

ipcMain.handle('video:getInfo', async (_event, url) => {
  const ytDlpPath = getBinPath(resourcesRoot(), isDev, 'yt-dlp.exe');
  return getVideoInfo(ytDlpPath, url);
});

// options: { url, title, section: { start, end } | null }
ipcMain.handle('video:download', async (_event, options) => {
  const root = resourcesRoot();
  const ytDlpPath = getBinPath(root, isDev, 'yt-dlp.exe');
  const ffprobePath = getBinPath(root, isDev, 'ffprobe.exe');
  const ffmpegDir = path.dirname(getBinPath(root, isDev, 'ffmpeg.exe'));
  const downloadsDir = await getDownloadsDir();

  const result = await downloadVideo({
    ytDlpPath,
    ffprobePath,
    ffmpegDir,
    downloadsDir,
    url: options.url,
    section: options.section || null,
    quality: options.quality || null,
    format: options.format || null,
    audioOnly: Boolean(options.audioOnly),
    audioFormat: options.audioFormat || null,
    onProgress: (progress) => {
      if (mainWindow) mainWindow.webContents.send('video:downloadProgress', progress);
    },
  });

  await addToHistory(historyFilePath, buildHistoryEntry({
    id: randomUUID(),
    downloadedAt: new Date().toISOString(),
    title: options.title || options.url,
    filePath: result.filePath,
    url: options.url,
    type: options.section ? 'clip' : 'video',
    verified: result.verified,
  }));

  return result;
});

// options: { thumbnailUrl, title, id, format }
ipcMain.handle('thumbnail:download', async (_event, options) => {
  const root = resourcesRoot();
  const ffmpegPath = getBinPath(root, isDev, 'ffmpeg.exe');
  const ffprobePath = getBinPath(root, isDev, 'ffprobe.exe');
  const downloadsDir = await getDownloadsDir();

  return downloadThumbnail({
    ffmpegPath,
    ffprobePath,
    downloadsDir,
    thumbnailUrl: options.thumbnailUrl,
    title: options.title,
    id: options.id,
    format: options.format || 'jpg',
  });
});

// options: { url, id, langs, format }
ipcMain.handle('subtitles:download', async (_event, options) => {
  const root = resourcesRoot();
  const ytDlpPath = getBinPath(root, isDev, 'yt-dlp.exe');
  const ffmpegDir = path.dirname(getBinPath(root, isDev, 'ffmpeg.exe'));
  const downloadsDir = await getDownloadsDir();

  return downloadSubtitles({
    ytDlpPath,
    ffmpegDir,
    downloadsDir,
    url: options.url,
    id: options.id,
    langs: options.langs || [],
    format: options.format || 'srt',
  });
});

// options: { info, format }
ipcMain.handle('metadata:save', async (_event, options) => {
  const downloadsDir = await getDownloadsDir();
  return saveMetadata({
    downloadsDir,
    title: options.info?.title,
    id: options.info?.id,
    format: options.format || 'json',
    info: options.info,
  });
});

ipcMain.handle('playlist:getInfo', async (_event, url) => {
  const ytDlpPath = getBinPath(resourcesRoot(), isDev, 'yt-dlp.exe');
  return getPlaylistInfo(ytDlpPath, url);
});

// options: { items, quality, format, audioOnly, audioFormat }
// items is the checklist selection: [{ id, url, title }, ...]
ipcMain.handle('playlist:download', async (_event, options) => {
  const root = resourcesRoot();
  const ytDlpPath = getBinPath(root, isDev, 'yt-dlp.exe');
  const ffprobePath = getBinPath(root, isDev, 'ffprobe.exe');
  const ffmpegDir = path.dirname(getBinPath(root, isDev, 'ffmpeg.exe'));
  const downloadsDir = await getDownloadsDir();

  return downloadPlaylist({
    ytDlpPath,
    ffprobePath,
    ffmpegDir,
    downloadsDir,
    items: options.items,
    quality: options.quality || null,
    format: options.format || null,
    audioOnly: Boolean(options.audioOnly),
    audioFormat: options.audioFormat || null,
    onItemUpdate: (id, update) => {
      if (mainWindow) mainWindow.webContents.send('playlist:itemUpdate', { id, ...update });

      // Best-effort: a history-write hiccup shouldn't take down the
      // download itself, so this is deliberately fire-and-forget.
      if (update.status === 'done') {
        const item = options.items.find((i) => i.id === id);
        addToHistory(historyFilePath, buildHistoryEntry({
          id: randomUUID(),
          downloadedAt: new Date().toISOString(),
          title: item?.title || item?.url || id,
          filePath: update.result?.filePath,
          url: item?.url,
          type: 'playlist-item',
          verified: update.result?.verified,
        })).catch(() => {});
      }
    },
  });
});

ipcMain.handle('settings:get', async () => readSettings(settingsFilePath));

ipcMain.handle('settings:set', async (_event, updates) => updateSettings(settingsFilePath, updates));

ipcMain.handle('settings:chooseFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return readSettings(settingsFilePath);
  return updateSettings(settingsFilePath, { defaultFolder: result.filePaths[0] });
});

ipcMain.handle('history:list', async () => readHistory(historyFilePath));

ipcMain.handle('history:clear', async () => clearHistory(historyFilePath));

// Reveals the file in Explorer. Checked first since the file could have
// been moved or deleted since it was downloaded — that should show up as
// a clear message, not silently do nothing.
ipcMain.handle('history:openFile', async (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('This file no longer exists — it may have been moved or deleted.');
  }
  shell.showItemInFolder(filePath);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
