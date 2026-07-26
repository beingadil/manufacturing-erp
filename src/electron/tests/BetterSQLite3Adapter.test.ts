import { BetterSQLite3Adapter } from '../sqlite/BetterSQLite3Adapter';

// Mock the window.electronDB object for testing purposes
const mockElectronDB = {
  initialize: vi.fn().mockResolvedValue({ success: true }),
  query: vi.fn().mockResolvedValue({ success: true, data: [{ id: 1, name: 'Test' }] }),
  queryOne: vi.fn().mockResolvedValue({ success: true, data: { id: 1, name: 'Test' } }),
  execute: vi.fn().mockResolvedValue({ success: true, data: { changes: 1, lastInsertRowid: 1 } }),
  transaction: vi.fn().mockResolvedValue({ success: true, data: [] }),
  close: vi.fn().mockResolvedValue({ success: true }),
};

describe('BetterSQLite3Adapter', () => {
  let adapter: BetterSQLite3Adapter;

  beforeAll(() => {
    (global as any).window = { electronDB: mockElectronDB };
    adapter = new BetterSQLite3Adapter();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize successfully', async () => {
    await adapter.initialize();
    expect(mockElectronDB.initialize).toHaveBeenCalled();
  });

  it('should execute a query', async () => {
    const result = await adapter.query('SELECT * FROM users');
    expect(mockElectronDB.query).toHaveBeenCalledWith(expect.objectContaining({
      sql: 'SELECT * FROM users',
    }));
    expect(result).toEqual([{ id: 1, name: 'Test' }]);
  });

  it('should execute an update', async () => {
    const result = await adapter.execute('UPDATE users SET name = ? WHERE id = ?', ['John', 1]);
    expect(mockElectronDB.execute).toHaveBeenCalledWith(expect.objectContaining({
      sql: 'UPDATE users SET name = ? WHERE id = ?',
      params: ['John', 1],
    }));
    expect(result).toEqual({ changes: 1, lastInsertRowid: 1 });
  });

  it('should batch transaction operations', async () => {
    await adapter.transaction(async (tx) => {
      await tx.execute('INSERT INTO a (v) VALUES (1)');
      await tx.execute('INSERT INTO b (v) VALUES (2)');
    });
    
    expect(mockElectronDB.transaction).toHaveBeenCalledWith(expect.objectContaining({
      operations: [
        { type: 'execute', sql: 'INSERT INTO a (v) VALUES (1)', params: undefined },
        { type: 'execute', sql: 'INSERT INTO b (v) VALUES (2)', params: undefined }
      ]
    }));
  });
});
