/**
 * Core SQLite Database Adapter Interface.
 * This ensures the business logic and repository layers remain entirely agnostic
 * of the underlying driver (e.g. better-sqlite3 in Electron, or sql.js in browser testing).
 */
export interface ISQLiteAdapter {
  /** Initialize the database connection */
  initialize(dbPath?: string): Promise<void>;
  
  /** Execute a query that returns multiple rows */
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  
  /** Execute a query that returns a single row */
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  
  /** Execute an INSERT/UPDATE/DELETE statement and return affected rows / last ID */
  execute(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number | string }>;
  
  /** Transaction wrapper */
  transaction<T>(callback: (tx: ISQLiteTransaction) => Promise<T>): Promise<T>;
  
  /** Close the connection */
  close(): Promise<void>;
}

export interface ISQLiteTransaction {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number | string }>;
}
