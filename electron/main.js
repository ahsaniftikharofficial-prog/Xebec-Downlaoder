const { app, BrowserWindow, ipcMain, clipboard, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { firstLine, runBinary } = require('./engine');
const { getVideoInfo, downloadVideo } = require('./downloadManager');
const { downloadThumbnail, downloadSubtitles, saveMetadata } = require('./assetManager');
const { getPlaylistInfo, downloadPlaylist } = require('./playlistManager');
const { readHistory, addToHistory, clearHistory } = require('./historyManager');
const { buildHistoryEntry } = require('./history');
const { readSettings, updateSettings } = require('./settingsManager');
const { isYouTubeUrl } = require('./clipboard');
const {
  ensureEngineBinary,
  readEngineMetadata,
  checkAndUpdateEngine,
  rollbackYtDlp,
  rollbackFfmpeg,
  acknowledgeEngineUpdate,
} = require('./updaterManager');
const { autoUpdater } = require('electron-updater');
const { buildUpdateNotice, isMeaningfulUpdate } = require('./appUpdater');

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

// Phase 7: every place that needs yt-dlp/ffmpeg now goes through this
// instead of calling getBinPath directly — it resolves to the writable,
// self-updating copy (seeding it from the bundled original the first
// time it's needed), never the read-only copy inside the app install.
async function enginePaths() {
  const userDataPath = app.getPath('userData');
  const root = resourcesRoot();
  const ytDlpPath = await ensureEngineBinary(userDataPath, root, isDev, 'yt-dlp.exe');
  const ffmpegPath = await ensureEngineBinary(userDataPath, root, isDev, 'ffmpeg.exe');
  const ffprobePath = await ensureEngineBinary(userDataPath, root, isDev, 'ffprobe.exe');
  return { ytDlpPath, ffmpegPath, ffprobePath, ffmpegDir: path.dirname(ffmpegPath) };
}

// Sends an IPC event once the window has actually finished loading and
// registered its listeners — sending earlier (e.g. mid self-heal check
// racing the page load) would fire into empty air with nothing listening.
function sendToRenderer(channel, payload) {
  if (!mainWindow) return;
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', () => {
      if (mainWindow) mainWindow.webContents.send(channel, payload);
    });
  } else {
    mainWindow.webContents.send(channel, payload);
  }
}

// Runs once per launch, in the background, after the window is already
// open — never awaited before createWindow, so no internet or a down
// GitHub can never delay the app opening. yt-dlp and ffmpeg are checked
// independently inside checkAndUpdateEngine, so one failing never blocks
// the other. Only sends an event to the UI when something actually
// changed; a "nothing to update" check is silent, on purpose.
async function runEngineSelfHeal() {
  try {
    const result = await checkAndUpdateEngine({
      userDataPath: app.getPath('userData'),
      resourcesRoot: resourcesRoot(),
      isDev,
    });
    if (result.ytDlp.updated || result.ffmpeg.updated) {
      sendToRenderer('engine:updated', result);
    }
  } catch (err) {
    // Self-heal is a background nicety, not something that should ever
    // crash the app or interrupt whatever the user is doing.
    console.error('Engine self-heal check failed:', err.message);
  }
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

// Phase 8: updates the app itself, separate from Phase 7's engine
// self-heal (which only ever touches yt-dlp/ffmpeg). electron-updater
// checks the GitHub Releases feed configured in package.json's "build"
// section, downloads in the background, and verifies the release's
// signature before ever emitting 'update-downloaded' — this app never
// installs anything it hasn't confirmed came from that feed.
//
// Only 'update-downloaded' and 'error' are listened to directly — every
// other event (checking, available-but-still-downloading,
// not-available) is deliberately left silent, same "don't nag" approach
// as Phase 7's engine notices.
autoUpdater.on('update-downloaded', (info) => {
  const notice = buildUpdateNotice('update-downloaded', info);
  if (notice && isMeaningfulUpdate(app.getVersion(), notice.version)) {
    sendToRenderer('appUpdate:ready', notice);
  }
});
autoUpdater.on('error', (err) => {
  // Same philosophy as Phase 7: a failed background check is not
  // something that should ever interrupt the user.
  console.error('App update check failed:', err.message);
});

async function runAppSelfUpdateCheck() {
  if (!app.isPackaged) return; // no release feed to check against in dev
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('App update check failed:', err.message);
  }
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

// Reports the versions of the binaries the app is actually running right
// now — from Phase 7 onward that's the writable, self-updating copy, not
// the one shipped with the installer, so this reflects any update that's
// happened since install.
ipcMain.handle('engine:check', async () => {
  const result = {};
  let paths;

  try {
    paths = await enginePaths();
  } catch (err) {
    result.ytDlpError = err.message;
    result.ffmpegError = err.message;
    return result;
  }

  try {
    result.ytDlp = await runBinary(paths.ytDlpPath, ['--version']);
  } catch (err) {
    result.ytDlpError = err.message;
  }

  try {
    const output = await runBinary(paths.ffmpegPath, ['-version']);
    result.ffmpeg = firstLine(output);
  } catch (err) {
    result.ffmpegError = err.message;
  }

  return result;
});

ipcMain.handle('video:getInfo', async (_event, url) => {
  const { ytDlpPath } = await enginePaths();
  return getVideoInfo(ytDlpPath, url);
});

// options: { url, title, section: { start, end } | null }
ipcMain.handle('video:download', async (_event, options) => {
  const { ytDlpPath, ffprobePath, ffmpegDir } = await enginePaths();
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
  const { ffmpegPath, ffprobePath } = await enginePaths();
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
  const { ytDlpPath, ffmpegDir } = await enginePaths();
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
  const { ytDlpPath } = await enginePaths();
  return getPlaylistInfo(ytDlpPath, url);
});

// options: { items, quality, format, audioOnly, audioFormat }
// items is the checklist selection: [{ id, url, title }, ...]
ipcMain.handle('playlist:download', async (_event, options) => {
  const { ytDlpPath, ffprobePath, ffmpegDir } = await enginePaths();
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

// Lets the UI catch up on the last known engine-update state on mount —
// covers the case where an update happened (or was already sitting there
// unacknowledged from a previous launch) before the renderer's listener
// for the live 'engine:updated' event was ready.
ipcMain.handle('engine:updateStatus', async () => {
  return readEngineMetadata(path.join(app.getPath('userData'), 'engine-versions.json'));
});

ipcMain.handle('engine:acknowledgeUpdate', async (_event, binary) => {
  return acknowledgeEngineUpdate(app.getPath('userData'), binary);
});

// Manual "Undo" — restores the backup made just before the last recorded
// update for that binary. Verified the same way a fresh update is: the
// restored binary has to actually run before it's put back in place.
ipcMain.handle('engine:rollback', async (_event, binary) => {
  const userDataPath = app.getPath('userData');
  const root = resourcesRoot();
  if (binary === 'yt-dlp') return rollbackYtDlp({ userDataPath, resourcesRoot: root, isDev });
  if (binary === 'ffmpeg') return rollbackFfmpeg({ userDataPath, resourcesRoot: root, isDev });
  throw new Error(`Unknown binary: ${binary}`);
});

ipcMain.handle('appUpdate:getVersion', async () => app.getVersion());

// Quits and installs the already-downloaded, already-verified update.
// Only ever called after the user clicks "Restart Now" on the update
// notice — never automatically.
ipcMain.handle('appUpdate:install', async () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
  createWindow();
  // Neither of these is awaited here — the window is already open by the
  // time they kick off, so a slow or unreachable GitHub can't delay
  // startup for either the engine binaries or the app itself.
  runEngineSelfHeal();
  runAppSelfUpdateCheck();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
