const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scratch', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  loadSheet: () => ipcRenderer.invoke('sheet:load'),
  saveSheet: (snapshot) => ipcRenderer.invoke('sheet:save', snapshot),
  exportSheet: (snapshot) => ipcRenderer.invoke('sheet:export', snapshot),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  hide: () => ipcRenderer.send('window:hide'),
  togglePin: () => ipcRenderer.send('window:toggle-pin'),
  onConfigChanged: (cb) => ipcRenderer.on('config:changed', (_e, cfg) => cb(cfg)),
  onShown: (cb) => ipcRenderer.on('window:shown', () => cb()),
});
