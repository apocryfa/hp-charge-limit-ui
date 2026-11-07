// Thin, explicit bridge. No node in the renderer; only these four calls.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hpc', {
  status: () => ipcRenderer.invoke('hpc:status'),
  setMode: (mode) => ipcRenderer.invoke('hpc:set-mode', mode),
  service: (enabled) => ipcRenderer.invoke('hpc:service', enabled),
  bypass: (enabled) => ipcRenderer.invoke('hpc:bypass', enabled),
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('is-electron');
});
