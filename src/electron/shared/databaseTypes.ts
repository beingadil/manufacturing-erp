export const IPC_CHANNELS = {
  DB_INITIALIZE: 'db:initialize',
  DB_QUERY: 'db:query',
  DB_QUERY_ONE: 'db:queryOne',
  DB_EXECUTE: 'db:execute',
  DB_TRANSACTION: 'db:transaction',
  DB_CLOSE: 'db:close',
} as const;

export interface DBRequest {
  id: string; // Unique message ID
  sql: string;
  params?: any[];
}

export interface DBResponse<T = any> {
  id: string;
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

export interface TransactionRequest {
  id: string;
  operations: {
    type: 'query' | 'execute';
    sql: string;
    params?: any[];
  }[];
}

export interface ExecuteResult {
  changes: number;
  lastInsertRowid: number | string;
}
