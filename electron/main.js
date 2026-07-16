const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { getBinPath, firstLine, runBinary } = require('./engine');
const { getVideoInfo, downloadVideo } = require('./downloadManager');

const isDev = process.env.NODE_ENV === 'development';
const projectRoot = path.join(__dirname, '..');

let mainWindow;

function resourcesRoot() {
  return isDev ? projectRoot : process.resourcesPath;
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

// options: { url, section: { start, end } | null }
ipcMain.handle('video:download', async (_event, options) => {
  const root = resourcesRoot();
  const ytDlpPath = getBinPath(root, isDev, 'yt-dlp.exe');
  const ffprobePath = getBinPath(root, isDev, 'ffprobe.exe');
  const ffmpegDir = path.dirname(getBinPath(root, isDev, 'ffmpeg.exe'));
  const downloadsDir = app.getPath('downloads');

  return downloadVideo({
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
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
