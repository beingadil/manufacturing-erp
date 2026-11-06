import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { SQLiteStorageAdapter } from '../database/sqlite/SQLiteStorageAdapter';

export interface SettingsState {
  // Profile
  userName: string;
  userEmail: string;
  profilePhoto: string | null;
  setProfile: (name: string, email: string, photo: string | null) => void;

  // AI Assistant (UI mirror only — the API key never lives in the renderer;
  // it is stored by electron/ai.cjs in userData/ai-config.json)
  aiAssistantEnabled: boolean;
  aiVoiceEnabled: boolean;
  setAiAssistantEnabled: (v: boolean) => void;
  setAiVoiceEnabled: (v: boolean) => void;

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

  // Voucher Numbering
  voucherYearlyReset: boolean;
  voucherPrefixes: Record<string, string>;
  setVoucherPrefixes: (prefixes: Record<string, string>) => void;
  setVoucherYearlyReset: (enabled: boolean) => void;

  // Document Numbering (PO / INV / DSP / REC / BILL / PRD prefixes)
  documentPrefixes: Record<string, string>;
  setDocumentPrefixes: (prefixes: Record<string, string>) => void;

  // Batch numbering: 'supplier' → {SupplierFirst}-{PO-2026-0001}; 'classic' → BATCH-{PO…}
  batchNoMode: 'supplier' | 'classic';
  setBatchNoMode: (mode: 'supplier' | 'classic') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      userName: 'Admin User',
      userEmail: 'admin@example.com',
      profilePhoto: null,
      setProfile: (userName, userEmail, profilePhoto) => set({ userName, userEmail, profilePhoto }),

      aiAssistantEnabled: false,
      aiVoiceEnabled: true,
      setAiAssistantEnabled: (aiAssistantEnabled) => set({ aiAssistantEnabled }),
      setAiVoiceEnabled: (aiVoiceEnabled) => set({ aiVoiceEnabled }),

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

      voucherYearlyReset: true,
      voucherPrefixes: {
        'Journal Voucher': 'JV',
        'Purchase Voucher': 'PUV',
        'Sales Voucher': 'SV',
        'Bank Payment': 'BP',
        'Bank Receipt': 'BR',
        'Cash Payment': 'CP',
        'Cash Receipt': 'CR',
        'Processor Bill': 'PB',
      },
      setVoucherPrefixes: (prefixes) => set({ voucherPrefixes: prefixes }),
      setVoucherYearlyReset: (voucherYearlyReset) => set({ voucherYearlyReset }),

      documentPrefixes: {
        'PO': 'PO',
        'INV': 'INV',
        'DSP': 'DSP',
        'REC': 'REC',
        'BILL': 'BILL',
        'PRD': 'PRD',
      },
      setDocumentPrefixes: (documentPrefixes) => set({ documentPrefixes }),
      batchNoMode: 'supplier',
      setBatchNoMode: (batchNoMode) => set({ batchNoMode }),
    }),
    {
      name: 'erp-settings',
      version: 3,
      // Bumped v2 → v3 for documentPrefixes/batchNoMode: identity-migrate so
      // previously-saved settings survive; new keys fall back to defaults.
      migrate: (persisted: any) => persisted,
      skipHydration: true,
      storage: createJSONStorage(() => SQLiteStorageAdapter)
    }
  )
);
