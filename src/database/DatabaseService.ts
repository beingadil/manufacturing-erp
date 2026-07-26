import { ISQLiteAdapter } from './sqlite/ISQLiteAdapter';
import { MockSQLiteAdapter } from './sqlite/MockSQLiteAdapter';
import { BetterSQLite3Adapter } from './sqlite/BetterSQLite3Adapter';
import { Logger } from '../store/useLogStore';

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronDB;
}

class DatabaseService {
  private db: ISQLiteAdapter;
  private initialized = false;

  constructor() {
    if (isElectron()) {
      this.db = new BetterSQLite3Adapter();
    } else {
      this.db = new MockSQLiteAdapter();
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      Logger.info('Database Service', 'Initializing Database Engine...');
      await this.db.initialize('erp_database.sqlite');
      this.initialized = true;
      Logger.info('Database Service', 'Database initialized successfully.');
    } catch (error: any) {
      Logger.error('Database Service', `Initialization Failed: ${error.message}`);
      throw error;
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  getAdapter(): ISQLiteAdapter {
    if (!this.initialized) {
      throw new Error('Database is not initialized. Call initialize() first.');
    }
    return this.db;
  }
}

export const dbService = new DatabaseService();
