const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronDB', {
  initialize: () => ipcRenderer.invoke('db:initialize'),
  query: (req) => ipcRenderer.invoke('db:query', req),
  queryOne: (req) => ipcRenderer.invoke('db:queryOne', req),
  execute: (req) => ipcRenderer.invoke('db:execute', req),
  transaction: (req) => ipcRenderer.invoke('db:transaction', req),
  close: () => ipcRenderer.invoke('db:close'),
  integrityCheck: () => ipcRenderer.invoke('db:integrityCheck'),
  backup: () => ipcRenderer.invoke('db:backup'),
  restore: (backupPath) => ipcRenderer.invoke('db:restore', backupPath),
  listBackups: () => ipcRenderer.invoke('db:listBackups'),
  deleteBackup: (filename) => ipcRenderer.invoke('db:deleteBackup', filename),
  diag: () => ipcRenderer.invoke('db:diag'),
  isElectron: true,

  // Auto-update
  onUpdateStatus: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('update:status', handler);
    // Return unsubscribe function for cleanup
    return () => ipcRenderer.removeListener('update:status', handler);
  },
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),

  // Backup export/import via native dialogs
  exportBackup: () => ipcRenderer.invoke('dialog:exportBackup'),
  importBackup: () => ipcRenderer.invoke('dialog:importBackup'),

  // Update migration notice — legacy per-machine install detection
  checkLegacyInstall: () => ipcRenderer.invoke('migration:checkLegacyInstall'),
});
