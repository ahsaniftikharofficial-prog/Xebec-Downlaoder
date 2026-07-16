const { contextBridge, ipcRenderer } = require('electron');

// Anything the React UI needs to call in the main process gets exposed
// here, deliberately, one function at a time — never the raw ipcRenderer.
contextBridge.exposeInMainWorld('api', {
  checkEngine: () => ipcRenderer.invoke('engine:check'),
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
});
