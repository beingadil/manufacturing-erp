import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Desktop } from '../lib/desktop/DesktopInterop';
import { dbService } from '../database/DatabaseService';
import { Role, Permission, RolePermission, UserRow, AuditLog, LoginHistory, DataAccessPolicy } from '../types/access';

const OLD_KEY = 'access-storage';
const NEW_KEY = 'erp-access-storage';

// Async storage adapter: prefers SQLite, falls back to localStorage,
// and migrates data from old key to new key automatically.
const desktopStorage = {
  getItem: async (_name: string): Promise<string | null> => {
    const name = NEW_KEY;

    // 1. Try SQLite (wait a moment for dbService to become ready if needed)
    let dbReady = dbService.isReady();
    if (!dbReady) {
      // The persist middleware calls getItem at module import time, before
      // bootstrap() has finished initializing the database. Retry briefly.
      // Start with a 0ms check so we don't waste a full setTimeout cycle
      // when bootstrap is already running.
      for (let i = 0; i < 20; i++) {
        await new Promise<void>(r => setTimeout(r, i === 0 ? 0 : 50));
        dbReady = dbService.isReady();
        if (dbReady) break;
      }
    }
    if (dbReady) {
      const db = dbService.getAdapter();
      try {
        const row = await db.queryOne<{value: string}>(
          'SELECT value FROM key_value_store WHERE key = ?',
          [name]
        );
        if (row) return row.value;
      } catch { /* fall through */ }
    }

    // 2. Try the new key in localStorage
    const newVal = await Desktop.storage.getItem(name);
    if (newVal) {
      // Migrate to SQLite (fire-and-forget)
      if (dbService.isReady()) {
        try {
          const db = dbService.getAdapter();
          await db.execute(
            `INSERT INTO key_value_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [name, newVal]
          );
        } catch {}
      }
      return newVal;
    }

    // 3. Try the old key in localStorage and migrate
    const oldVal = await Desktop.storage.getItem(OLD_KEY);
    if (oldVal) {
      if (dbService.isReady()) {
        try {
          const db = dbService.getAdapter();
          await db.execute(
            `INSERT INTO key_value_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [name, oldVal]
          );
        } catch {}
      }
      await Desktop.storage.setItem(name, oldVal);
      await Desktop.storage.removeItem(OLD_KEY);
      return oldVal;
    }

    return null;
  },

  setItem: async (_name: string, value: string): Promise<void> => {
    const name = NEW_KEY;
    
    // Always write to localStorage as a safety backup.
    // This ensures getItem can recover data on startup even when
    // dbService.isReady() is false (before bootstrap finishes).
    try {
      await Desktop.storage.setItem(name, value);
    } catch (err) {
      console.warn('[AccessStore] localStorage backup failed, data safe in SQLite:', err);
    }

    // Also persist to SQLite as the primary store
    if (dbService.isReady()) {
      const db = dbService.getAdapter();
      try {
        await db.execute(
          `INSERT INTO key_value_store (key, value, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
          [name, value]
        );
      } catch (err) {
        console.warn('[AccessStore] SQLite persist failed, localStorage has backup:', err);
      }
    }
    // Clean up old key if present
    try { await Desktop.storage.removeItem(OLD_KEY); } catch {}
  },

  removeItem: async (_name: string): Promise<void> => {
    const name = NEW_KEY;
    if (dbService.isReady()) {
      const db = dbService.getAdapter();
      try {
        await db.execute('DELETE FROM key_value_store WHERE key = ?', [name]);
      } catch {}
    }
    await Desktop.storage.removeItem(name);
    try { await Desktop.storage.removeItem(OLD_KEY); } catch {}
  },
};

export interface UserPassword {
  user_id: string;
  password_hash: string;
}

interface AccessState {
  users: UserRow[];
  roles: Role[];
  permissions: Permission[];
  rolePermissions: RolePermission[];
  auditLogs: AuditLog[];
  loginHistory: LoginHistory[];
  dataPolicies: DataAccessPolicy[];
  passwords: UserPassword[];

  // Actions
  addUser: (user: Omit<UserRow, 'id' | 'created_at'>, passwordHash: string) => UserRow;
  updateUser: (id: string, updates: Partial<UserRow>) => void;
  deleteUser: (id: string) => void;
  changePassword: (userId: string, newHash: string) => void;
  verifyPassword: (userId: string, hash: string) => boolean;

  addRole: (role: Omit<Role, 'id' | 'created_at'>) => Role;
  updateRole: (id: string, updates: Partial<Role>) => void;
  deleteRole: (id: string) => void;

  setRolePermissions: (roleId: string, permissionIds: string[]) => void;

  logAudit: (log: Omit<AuditLog, 'id' | 'created_at'>) => void;
  recordLogin: (userId: string) => string;
  recordLogout: (historyId: string) => void;
  
  seedDefaults: () => void;
}

// Initial permissions based on previous setup
const DEFAULT_PERMISSIONS = [
  // Dashboard
  { module: 'Dashboard', action: 'View' },
  // Customers
  { module: 'Customers', action: 'View' }, { module: 'Customers', action: 'Create' }, { module: 'Customers', action: 'Edit' }, { module: 'Customers', action: 'Delete' },
  // Suppliers
  { module: 'Suppliers', action: 'View' }, { module: 'Suppliers', action: 'Create' }, { module: 'Suppliers', action: 'Edit' }, { module: 'Suppliers', action: 'Delete' },
  // Processors
  { module: 'Processors', action: 'View' }, { module: 'Processors', action: 'Create' }, { module: 'Processors', action: 'Edit' }, { module: 'Processors', action: 'Delete' },
  // Raw Materials
  { module: 'Raw Materials', action: 'View' }, { module: 'Raw Materials', action: 'Create' }, { module: 'Raw Materials', action: 'Edit' }, { module: 'Raw Materials', action: 'Delete' },
  // Products
  { module: 'Products', action: 'View' }, { module: 'Products', action: 'Create' }, { module: 'Products', action: 'Edit' }, { module: 'Products', action: 'Delete' },
  // Purchases
  { module: 'Purchases', action: 'View' }, { module: 'Purchases', action: 'Create' }, { module: 'Purchases', action: 'Edit' }, { module: 'Purchases', action: 'Delete' },
  // Processing
  { module: 'Processing', action: 'View' }, { module: 'Processing', action: 'Create' }, { module: 'Processing', action: 'Edit' }, { module: 'Processing', action: 'Delete' },
  // Sales
  { module: 'Sales', action: 'View' }, { module: 'Sales', action: 'Create' }, { module: 'Sales', action: 'Edit' }, { module: 'Sales', action: 'Delete' },
  // Inventory
  { module: 'Inventory', action: 'View' }, { module: 'Inventory', action: 'Create' }, { module: 'Inventory', action: 'Edit' }, { module: 'Inventory', action: 'Delete' },
  // Accounting
  { module: 'Accounting', action: 'View' }, { module: 'Accounting', action: 'Create' }, { module: 'Accounting', action: 'Edit' }, { module: 'Accounting', action: 'Delete' },
  // Reports
  { module: 'Reports', action: 'View' }, { module: 'Reports', action: 'Print' }, { module: 'Reports', action: 'Export' },
  // Access Management
  { module: 'Users', action: 'View' }, { module: 'Users', action: 'Create' }, { module: 'Users', action: 'Edit' }, { module: 'Users', action: 'Delete' },
  // Settings
  { module: 'Settings', action: 'View' }, { module: 'Settings', action: 'Edit' },
];

// Helper to hash password (simple SHA-256 for local offline use)
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const useAccessStore = create<AccessState>()(
  persist(
    (set, get) => ({
      users: [],
      roles: [],
      permissions: [],
      rolePermissions: [],
      auditLogs: [],
      loginHistory: [],
      dataPolicies: [],
      passwords: [],

      addUser: (user, passwordHash) => {
        const id = uuidv4();
        const newUser: UserRow = { ...user, id, created_at: new Date().toISOString() };
        set((state) => ({
          users: [...state.users, newUser],
          passwords: [...state.passwords, { user_id: id, password_hash: passwordHash }]
        }));
        return newUser;
      },

      updateUser: (id, updates) => {
        set((state) => ({
          users: state.users.map((u) => (u.id === id ? { ...u, ...updates } : u)),
        }));
      },

      deleteUser: (id) => {
        set((state) => ({
          users: state.users.map((u) => (u.id === id ? { ...u, deleted_at: new Date().toISOString() } : u)),
        }));
      },

      changePassword: (userId, newHash) => {
        set((state) => {
          const others = state.passwords.filter(p => p.user_id !== userId);
          return { passwords: [...others, { user_id: userId, password_hash: newHash }] };
        });
      },

      verifyPassword: (userId, hash) => {
        const entry = get().passwords.find(p => p.user_id === userId);
        return entry?.password_hash === hash;
      },

      addRole: (role) => {
        const id = uuidv4();
        const newRole: Role = { ...role, id, created_at: new Date().toISOString() };
        set((state) => ({ roles: [...state.roles, newRole] }));
        return newRole;
      },

      updateRole: (id, updates) => {
        set((state) => ({
          roles: state.roles.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        }));
      },

      deleteRole: (id) => {
        set((state) => ({
          roles: state.roles.filter((r) => r.id !== id),
          rolePermissions: state.rolePermissions.filter((rp) => rp.role_id !== id),
        }));
      },

      setRolePermissions: (roleId, permissionIds) => {
        set((state) => {
          const filtered = state.rolePermissions.filter((rp) => rp.role_id !== roleId);
          const newRPs = permissionIds.map(pid => ({ id: uuidv4(), role_id: roleId, permission_id: pid }));
          return { rolePermissions: [...filtered, ...newRPs] };
        });
      },

      logAudit: (log) => {
        const newLog: AuditLog = { ...log, id: uuidv4(), created_at: new Date().toISOString() };
        set((state) => ({ auditLogs: [newLog, ...state.auditLogs] }));
      },

      recordLogin: (userId) => {
        const id = uuidv4();
        const entry: LoginHistory = {
          id,
          user_id: userId,
          login_time: new Date().toISOString(),
          status: 'Active',
          created_at: new Date().toISOString()
        };
        set((state) => ({ loginHistory: [entry, ...state.loginHistory] }));
        return id;
      },

      recordLogout: (historyId) => {
        set((state) => ({
          loginHistory: state.loginHistory.map((h) => 
            h.id === historyId 
              ? { ...h, logout_time: new Date().toISOString(), status: 'Logged Out' } 
              : h
          )
        }));
      },

      seedDefaults: () => {
        const state = get();
        if (state.roles.length > 0) return; // Already seeded

        // 1. Seed Permissions
        const perms = DEFAULT_PERMISSIONS.map(p => ({
          id: uuidv4(),
          module: p.module,
          action: p.action,
        }));

        // 2. Seed Default Roles
        const adminRole: Role = { id: uuidv4(), name: 'Admin', is_system: true, type: 'Default', created_at: new Date().toISOString() };
        const accountantRole: Role = { id: uuidv4(), name: 'Accountant', is_system: true, type: 'Default', created_at: new Date().toISOString() };
        const staffRole: Role = { id: uuidv4(), name: 'Staff', is_system: true, type: 'Default', created_at: new Date().toISOString() };

        // 3. Seed Role Permissions (Admin gets all)
        const adminPerms = perms.map(p => ({ id: uuidv4(), role_id: adminRole.id, permission_id: p.id }));

        // 4. Create Admin User
        const adminUser: UserRow = {
          id: uuidv4(),
          name: 'System Administrator',
          username: 'systemadministrator_877b',
          email: 'admin@miaoda.com',
          status: 'active',
          role_id: adminRole.id,
          created_at: new Date().toISOString()
        };

        // SHA-256 for '04HaMJAGCce3kwn5IEA1!'
        // Using pre-computed hash for immediate sync capability, or will compute on the fly.
        // Actually, we can just do it async but zustand acts sync.
        // For seed we can use a known plain text until hash is available, but let's pre-compute:
        // Hash of '04HaMJAGCce3kwn5IEA1!'
        const defaultHash = '7c57aabb36e269353941284fc448088bf76eac768783a9efb8a31e240a389ae7';

        set({
          permissions: perms,
          roles: [adminRole, accountantRole, staffRole],
          rolePermissions: adminPerms,
          users: [adminUser],
          passwords: [{ user_id: adminUser.id, password_hash: defaultHash }]
        });
      }
    }),
    {
      name: NEW_KEY,
      version: 2,
      storage: createJSONStorage(() => desktopStorage),
      migrate: (persisted: any, version: number) => {
        // Version 1 to 2: key renamed from 'access-storage' to 'erp-access-storage',
        // adapter already handles migration transparently
        return persisted as any;
      }
    }
  )
);