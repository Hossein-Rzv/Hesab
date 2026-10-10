'use strict'
// preload.cjs — bridge بین renderer و main process
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  // سازگاری با نام قدیمی استفاده‌شده در settings.js
  pickDirectory: () => ipcRenderer.invoke('select-folder'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  restartServer: () => ipcRenderer.send('restart-server'),
  platform: process.platform,
})

// سازگاری backward-compatible با کدی که از hesabAPI استفاده می‌کند
try {
  if (!window.hesabAPI) window.hesabAPI = window.electronAPI
} catch { /* ignore */ }
