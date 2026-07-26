import Database from 'better-sqlite3';
import { ipcMain } from 'electron';
import { IPC_CHANNELS, DBRequest, DBResponse, TransactionRequest, ExecuteResult } from '../shared/databaseTypes';

export class SQLiteMainHandler {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  public registerHandlers() {
    ipcMain.handle(IPC_CHANNELS.DB_INITIALIZE, async () => {
      try {
        if (!this.db) {
          this.db = new Database(this.dbPath, { verbose: console.log });
          this.db.pragma('journal_mode = WAL');
          this.db.pragma('foreign_keys = ON');
        }
        return { success: true };
      } catch (error: any) {
        console.error('Failed to initialize database:', error);
        return { success: false, error: { message: error.message } };
      }
    });

    ipcMain.handle(IPC_CHANNELS.DB_QUERY, async (_, req: DBRequest): Promise<DBResponse> => {
      try {
        if (!this.db) throw new Error('Database not initialized');
        const stmt = this.db.prepare(req.sql);
        const data = stmt.all(...(req.params || []));
        return { id: req.id, success: true, data };
      } catch (error: any) {
        return { id: req.id, success: false, error: { message: error.message, code: error.code } };
      }
    });

    ipcMain.handle(IPC_CHANNELS.DB_QUERY_ONE, async (_, req: DBRequest): Promise<DBResponse> => {
      try {
        if (!this.db) throw new Error('Database not initialized');
        const stmt = this.db.prepare(req.sql);
        const data = stmt.get(...(req.params || []));
        return { id: req.id, success: true, data: data || null };
      } catch (error: any) {
        return { id: req.id, success: false, error: { message: error.message, code: error.code } };
      }
    });

    ipcMain.handle(IPC_CHANNELS.DB_EXECUTE, async (_, req: DBRequest): Promise<DBResponse<ExecuteResult>> => {
      try {
        if (!this.db) throw new Error('Database not initialized');
        const stmt = this.db.prepare(req.sql);
        const info = stmt.run(...(req.params || []));
        return { 
          id: req.id, 
          success: true, 
          data: { changes: info.changes, lastInsertRowid: info.lastInsertRowid.toString() } 
        };
      } catch (error: any) {
        return { id: req.id, success: false, error: { message: error.message, code: error.code } };
      }
    });

    ipcMain.handle(IPC_CHANNELS.DB_TRANSACTION, async (_, req: TransactionRequest): Promise<DBResponse> => {
      if (!this.db) return { id: req.id, success: false, error: { message: 'Database not initialized' } };
      
      const results: any[] = [];
      
      const executeTransaction = this.db.transaction((operations: TransactionRequest['operations']) => {
        for (const op of operations) {
          const stmt = this.db!.prepare(op.sql);
          if (op.type === 'query') {
            results.push(stmt.all(...(op.params || [])));
          } else {
            const info = stmt.run(...(op.params || []));
            results.push({ changes: info.changes, lastInsertRowid: info.lastInsertRowid.toString() });
          }
        }
      });

      try {
        executeTransaction(req.operations);
        return { id: req.id, success: true, data: results };
      } catch (error: any) {
        return { id: req.id, success: false, error: { message: error.message, code: error.code } };
      }
    });

    ipcMain.handle(IPC_CHANNELS.DB_CLOSE, async () => {
      if (this.db) {
        this.db.close();
        this.db = null;
      }
      return { success: true };
    });
  }
}
