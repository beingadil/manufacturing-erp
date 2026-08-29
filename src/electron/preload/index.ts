import { contextBridge, ipcRenderer } from 'electron';
import { DBRequest, IPC_CHANNELS, TransactionRequest } from '../shared/databaseTypes';

// Expose safe IPC methods to the renderer process
contextBridge.exposeInMainWorld('electronDB', {
  initialize: () => ipcRenderer.invoke(IPC_CHANNELS.DB_INITIALIZE),
  query: (req: DBRequest) => ipcRenderer.invoke(IPC_CHANNELS.DB_QUERY, req),
  queryOne: (req: DBRequest) => ipcRenderer.invoke(IPC_CHANNELS.DB_QUERY_ONE, req),
  execute: (req: DBRequest) => ipcRenderer.invoke(IPC_CHANNELS.DB_EXECUTE, req),
  transaction: (req: TransactionRequest) => ipcRenderer.invoke(IPC_CHANNELS.DB_TRANSACTION, req),
  close: () => ipcRenderer.invoke(IPC_CHANNELS.DB_CLOSE),
  integrityCheck: () => ipcRenderer.invoke("db:integrityCheck"),
  diag: () => ipcRenderer.invoke("db:diag"),
});
