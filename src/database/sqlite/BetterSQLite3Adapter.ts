import { ISQLiteAdapter, ISQLiteTransaction } from './ISQLiteAdapter';
import { v4 as uuidv4 } from 'uuid';
import { DBRequest, TransactionRequest, DBResponse, ExecuteResult } from '../../electron/shared/databaseTypes';

declare global {
  interface Window {
    electronDB: {
      initialize: () => Promise<{ success: boolean; error?: any }>;
      query: (req: DBRequest) => Promise<DBResponse>;
      queryOne: (req: DBRequest) => Promise<DBResponse>;
      execute: (req: DBRequest) => Promise<DBResponse<ExecuteResult>>;
      transaction: (req: TransactionRequest) => Promise<DBResponse>;
      close: () => Promise<{ success: boolean }>;
      integrityCheck: () => Promise<{ success: boolean; details?: any[]; error?: string }>;
      backup: () => Promise<{ success: boolean; path?: string; error?: string; size?: number }>;
      restore: (backupPath: string) => Promise<{ success: boolean; error?: string }>;
      listBackups: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
      deleteBackup: (filename: string) => Promise<{ success: boolean; error?: string }>;
      diag: () => Promise<{ success: boolean; data?: { path: string; exists: boolean; size: number }; error?: string }>;
      exportBackup: () => Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string; manifest?: any }>;
      importBackup: () => Promise<{ success: boolean; canceled?: boolean; error?: string; safetyBackupPath?: string; manifest?: any }>;
      isElectron?: boolean;
      onUpdateStatus: (callback: (status: any) => void) => void;
      checkForUpdates: () => Promise<{ success: boolean; error?: string }>;
      installUpdate: () => Promise<{ success: boolean; error?: string }>;
      checkLegacyInstall: () => Promise<{
        success: boolean;
        data?: {
          runningFromLegacy: boolean;
          legacyInstallPaths: string[];
          currentExePath: string;
          currentDir: string;
          isWindows: boolean;
        };
        error?: string;
      }>;
    };
  }
}

export class BetterSQLite3Adapter implements ISQLiteAdapter {
  private isElectron(): boolean {
    return typeof window !== 'undefined' && !!window.electronDB;
  }

  async initialize(_dbPath?: string): Promise<void> {
    if (!this.isElectron()) {
      throw new Error('Electron environment not detected. Cannot initialize BetterSQLite3Adapter.');
    }
    const res = await window.electronDB.initialize();
    if (!res.success) {
      throw new Error(`Failed to initialize database: ${res.error?.message}`);
    }
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.isElectron()) throw new Error('Not in Electron');
    const req: DBRequest = { id: uuidv4(), sql, params };
    const res = await window.electronDB.query(req);
    if (!res.success) throw new Error(res.error?.message);
    return res.data as T[];
  }

  async queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
    if (!this.isElectron()) throw new Error('Not in Electron');
    const req: DBRequest = { id: uuidv4(), sql, params };
    const res = await window.electronDB.queryOne(req);
    if (!res.success) throw new Error(res.error?.message);
    return res.data as T | null;
  }

  async execute(sql: string, params?: any[]): Promise<ExecuteResult> {
    if (!this.isElectron()) throw new Error('Not in Electron');
    const req: DBRequest = { id: uuidv4(), sql, params };
    const res = await window.electronDB.execute(req);
    if (!res.success) throw new Error(res.error?.message);
    return res.data as ExecuteResult;
  }

  async transaction<T>(callback: (tx: ISQLiteTransaction) => Promise<T>): Promise<T> {
    if (!this.isElectron()) throw new Error('Not in Electron');
    
    // In Electron, we can't easily pass a callback function over IPC to run synchronously
    // in the main process SQLite transaction.
    // Instead, we accumulate the operations and send them as a single IPC batch request.
    const operations: { type: 'query' | 'execute'; sql: string; params?: any[] }[] = [];
    
    const tx: ISQLiteTransaction = {
      query: async <_T = any>(sql: string, params?: any[]) => {
        operations.push({ type: 'query', sql, params });
        // Warning: This architecture means we can't read the result of a query 
        // to determine the next query *within* the same transaction callback on the frontend.
        // For complex interactive transactions, logic should be moved to the main process
        // or stored procedures. For standard unit-of-work batching, this suffices.
        return [] as any; 
      },
      execute: async (sql: string, params?: any[]) => {
        operations.push({ type: 'execute', sql, params });
        return { changes: 0, lastInsertRowid: 0 };
      }
    };

    // The callback builds the operations array
    // Note: The callback shouldn't await results that are needed for subsequent operations in the same TX.
    await callback(tx);

    const req: TransactionRequest = { id: uuidv4(), operations };
    const res = await window.electronDB.transaction(req);
    
    if (!res.success) {
      throw new Error(`Transaction failed: ${res.error?.message}`);
    }
    
    // Return a dummy value as the real results are complex to map back sequentially in this abstraction
    return null as unknown as T;
  }

  async close(): Promise<void> {
    if (!this.isElectron()) return;
    await window.electronDB.close();
  }
}
