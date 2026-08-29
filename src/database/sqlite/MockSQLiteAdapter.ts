import { Logger } from '../../lib/logger';
import { ISQLiteAdapter, ISQLiteTransaction } from './ISQLiteAdapter';

/**
 * Fallback Mock SQLite Adapter for Browser Environments.
 * This simply logs queries to demonstrate the architecture is wired correctly
 * before the Electron payload is injected.
 */
export class MockSQLiteAdapter implements ISQLiteAdapter {
  private isInitialized = false;

  async initialize(dbPath?: string): Promise<void> {
    Logger.info('SQLite', `Initializing Mock Database at ${dbPath || ':memory:'}`);
    this.isInitialized = true;
  }

  async query<T = any>(_sql: string, _params?: any[]): Promise<T[]> {
    if (!this.isInitialized) throw new Error('Database not initialized');
    // Logger.info('SQLite.query', sql, JSON.stringify(params));
    return [];
  }

  async queryOne<T = any>(_sql: string, _params?: any[]): Promise<T | null> {
    if (!this.isInitialized) throw new Error('Database not initialized');
    // Logger.info('SQLite.queryOne', sql, JSON.stringify(params));
    return null;
  }

  async execute(_sql: string, _params?: any[]): Promise<{ changes: number; lastInsertRowid: number | string }> {
    if (!this.isInitialized) throw new Error('Database not initialized');
    // Logger.info('SQLite.execute', sql, JSON.stringify(params));
    return { changes: 1, lastInsertRowid: Date.now() };
  }

  async transaction<T>(callback: (tx: ISQLiteTransaction) => Promise<T>): Promise<T> {
    if (!this.isInitialized) throw new Error('Database not initialized');
    // Logger.info('SQLite.transaction', 'BEGIN TRANSACTION');
    try {
      const result = await callback({
        query: this.query.bind(this),
        execute: this.execute.bind(this)
      });
      // Logger.info('SQLite.transaction', 'COMMIT');
      return result;
    } catch (error) {
      // Logger.error('SQLite.transaction', 'ROLLBACK', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.isInitialized = false;
    Logger.info('SQLite', 'Database connection closed');
  }
}
