const { contextBridge, ipcRenderer } = require('electron');

// Anything the React UI needs to call in the main process gets exposed
// here, deliberately, one function at a time — never the raw ipcRenderer.
contextBridge.exposeInMainWorld('api', {
  checkEngine: () => ipcRenderer.invoke('engine:check'),
  readClipboardText: () => ipcRenderer.invoke('clipboard:read'),
  getVideoInfo: (url) => ipcRenderer.invoke('video:getInfo', url),
  downloadVideo: (options) => ipcRenderer.invoke('video:download', options),
  downloadThumbnail: (options) => ipcRenderer.invoke('thumbnail:download', options),
  downloadSubtitles: (options) => ipcRenderer.invoke('subtitles:download', options),
  saveMetadata: (options) => ipcRenderer.invoke('metadata:save', options),
  // Returns an unsubscribe function so React can clean up on unmount.
  onDownloadProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('video:downloadProgress', listener);
    return () => ipcRenderer.removeListener('video:downloadProgress', listener);
  },
  getPlaylistInfo: (url) => ipcRenderer.invoke('playlist:getInfo', url),
  downloadPlaylist: (options) => ipcRenderer.invoke('playlist:download', options),
  onPlaylistItemUpdate: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('playlist:itemUpdate', listener);
    return () => ipcRenderer.removeListener('playlist:itemUpdate', listener);
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (updates) => ipcRenderer.invoke('settings:set', updates),
  chooseDownloadFolder: () => ipcRenderer.invoke('settings:chooseFolder'),
  getHistory: () => ipcRenderer.invoke('history:list'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  openHistoryFile: (filePath) => ipcRenderer.invoke('history:openFile', filePath),
  onClipboardDetected: (callback) => {
    const listener = (_event, text) => callback(text);
    ipcRenderer.on('clipboard:detected', listener);
    return () => ipcRenderer.removeListener('clipboard:detected', listener);
  },
  getEngineUpdateStatus: () => ipcRenderer.invoke('engine:updateStatus'),
  acknowledgeEngineUpdate: (binary) => ipcRenderer.invoke('engine:acknowledgeUpdate', binary),
  rollbackEngine: (binary) => ipcRenderer.invoke('engine:rollback', binary),
  onEngineUpdated: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on('engine:updated', listener);
    return () => ipcRenderer.removeListener('engine:updated', listener);
  },
  getAppVersion: () => ipcRenderer.invoke('appUpdate:getVersion'),
  installAppUpdate: () => ipcRenderer.invoke('appUpdate:install'),
  onAppUpdateReady: (callback) => {
    const listener = (_event, notice) => callback(notice);
    ipcRenderer.on('appUpdate:ready', listener);
    return () => ipcRenderer.removeListener('appUpdate:ready', listener);
  },
});
