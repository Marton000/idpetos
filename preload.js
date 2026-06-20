const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  moveWindow: (x, y) => ipcRenderer.send('move-window', x, y),
  getWindowPosition: () => ipcRenderer.invoke('get-window-position'),
  onWindowPosition: (callback) => {
    ipcRenderer.on('window-position', (event, x, y) => callback(x, y));
  },
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (enable) => ipcRenderer.invoke('set-auto-start', enable),
  setLanguage: (lang) => ipcRenderer.invoke('set-language', lang),
  getLanguage: () => ipcRenderer.invoke('get-language'),
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
  getScaleFactor: () => ipcRenderer.invoke('get-scale-factor'),
  onGlobalMouseMove: (callback) => {
    ipcRenderer.on('global-mouse-move', (event, x, y) => callback(x, y));
  },
  getForegroundWindow: () => ipcRenderer.invoke('get-foreground-window'),
  getSystemContext: () => ipcRenderer.invoke('get-system-context'),
  setWindowSize: (width, height) => ipcRenderer.send('set-window-size', width, height),
  onWindowMoving: (callback) => {
    ipcRenderer.on('window-moving', callback);
  },
  onWindowMoveEnd: (callback) => {
    ipcRenderer.on('window-move-end', callback);
  },
  onLanguageChanged: (callback) => {
    ipcRenderer.on('language-changed', (event, lang) => callback(lang));
  },
  getChatHistory: () => ipcRenderer.invoke('get-chat-history'),
  saveChatHistory: (entry) => ipcRenderer.invoke('save-chat-history', entry),
  getChatHistoryPath: () => ipcRenderer.invoke('get-chat-history-path'),
  openChatHistoryFolder: () => ipcRenderer.invoke('open-chat-history-folder'),
  openUserDataFolder: () => ipcRenderer.invoke('open-user-data-folder'),
  getSystemTheme: () => ipcRenderer.invoke('get-system-theme'),
  onSystemThemeChanged: (callback) => {
    ipcRenderer.on('system-theme-changed', (event, theme) => callback(theme));
  },
  setIgnoreMouseEvents: (ignore) => ipcRenderer.invoke('set-ignore-mouse-events', ignore),
  getPersistentDeviceId: () => ipcRenderer.invoke('get-persistent-device-id'),
  getAutoUpdate: () => ipcRenderer.invoke('get-auto-update'),
  setAutoUpdate: (enable) => ipcRenderer.invoke('set-auto-update', enable),
  onAutoUpdateChanged: (callback) => {
    ipcRenderer.on('auto-update-changed', (event, enabled) => callback(enabled));
  },
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, info) => callback(info));
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.on('update-not-available', (event, info) => callback(info));
  },
  onUpdateChecking: (callback) => {
    ipcRenderer.on('update-checking', () => callback());
  },
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update-progress', (event, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, info) => callback(info));
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', (event, error) => callback(error));
  },
  startDownloadUpdate: () => ipcRenderer.invoke('start-download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getCurrentVersion: () => ipcRenderer.invoke('get-current-version')
});
