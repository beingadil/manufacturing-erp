import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SQLiteStorageAdapter } from '../database/sqlite/SQLiteStorageAdapter';

export interface SettingsState {
  // Profile
  userName: string;
  userEmail: string;
  profilePhoto: string | null;
  setProfile: (name: string, email: string, photo: string | null) => void;

  // Branding
  dashboardName: string;
  tagline: string;
  logo: string | null;
  logoPosition: 'left' | 'center' | 'right';
  favicon: string | null;
  primaryColor: string;
  secondaryColor: string;
  setBranding: (data: Partial<SettingsState>) => void;
  resetLogo: () => void;

  // Preferences
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  language: string;
  timezone: string;
  notificationsEnabled: boolean;
  privacyMode: boolean;
  setPreferences: (data: Partial<SettingsState>) => void;

  // Security (UI State)
  twoFactorEnabled: boolean;
  setTwoFactor: (enabled: boolean) => void;

  // Voucher Numbering
  voucherYearlyReset: boolean;
  voucherPrefixes: Record<string, string>;
  setVoucherPrefixes: (prefixes: Record<string, string>) => void;
  setVoucherYearlyReset: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      userName: 'Admin User',
      userEmail: 'admin@example.com',
      profilePhoto: null,
      setProfile: (userName, userEmail, profilePhoto) => set({ userName, userEmail, profilePhoto }),

      dashboardName: 'Manufacturing ERP',
      tagline: 'Enterprise Resource Planning',
      logo: null,
      logoPosition: 'left',
      favicon: null,
      primaryColor: '#18181b', // zinc-950
      secondaryColor: '#f4f4f5', // zinc-100
      setBranding: (data) => set((state) => ({ ...state, ...data })),
      resetLogo: () => set({ logo: null, logoPosition: 'left' }),

      theme: 'system',
      setTheme: (theme) => set({ theme }),
      language: 'en-US',
      timezone: 'UTC',
      notificationsEnabled: true,
      privacyMode: false,
      setPreferences: (data) => set((state) => ({ ...state, ...data })),

      twoFactorEnabled: false,
      setTwoFactor: (twoFactorEnabled) => set({ twoFactorEnabled }),

      voucherYearlyReset: true,
      voucherPrefixes: {
        'Journal Voucher': 'JV',
        'Receipt Voucher': 'RV',
        'Payment Voucher': 'PV',
        'Purchase Voucher': 'PUV',
        'Sales Voucher': 'SV',
        'Contra Voucher': 'CV',
        'Opening Balance': 'OB',
        'Bank Payment': 'BP',
        'Bank Receipt': 'BR',
        'Cash Payment': 'CP',
        'Cash Receipt': 'CR',
        'Processor Bill': 'PB',
      },
      setVoucherPrefixes: (prefixes) => set({ voucherPrefixes: prefixes }),
      setVoucherYearlyReset: (voucherYearlyReset) => set({ voucherYearlyReset }),
    }),
    {
      name: 'erp-settings',
      version: 2,
      skipHydration: true,
      storage: createJSONStorage(() => SQLiteStorageAdapter)
    }
  )
);
