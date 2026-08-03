import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import "./index.css";
import { Desktop } from "./lib/desktop/DesktopInterop";
import { Logger } from "./lib/logger";
import { useLogStore } from "./store/useLogStore";
import { APP_VERSION, IS_PRODUCTION } from "./config/version.ts";
import { dbService } from "./database/DatabaseService";

async function bootstrap() {
  const rootElement = document.getElementById("root")!;
  
  try {
    Logger.info('Startup', 'Loading Configuration...', `Version: ${APP_VERSION}`);
    await Desktop.config.getConfig('app_version', APP_VERSION);

    const isDesktop = Desktop.platform.isDesktop();
    const os = Desktop.platform.getOS();
    Logger.info('Startup', 'Environment Check', `OS: ${os}, Desktop: ${isDesktop}, Prod: ${IS_PRODUCTION}`);

    // Initialize the database (starts IPC bridge to main process SQLite)
    if (Desktop.database) {
      await Desktop.database.initialize();
      Logger.info('Startup', 'Database initialized');
    }

    Logger.info('Startup', `DB ready: ${dbService.isReady()}`);

    // Rehydrate Zustand stores from persisted key_value_store blob.
    // Reads go through SQLiteStorageAdapter so the localStorage mirror is
    // honored in the browser preview (MockSQLiteAdapter stores nothing).
    try {
      if (dbService.isReady()) {
        const { SQLiteStorageAdapter } = await import('./database/sqlite/SQLiteStorageAdapter');
        const db = dbService.getAdapter();

        // ---- ERP store rehydration ----
        const erpValue = await SQLiteStorageAdapter.getItem('erp-storage');
        if (erpValue) {
          const parsed = JSON.parse(erpValue);
          const persistedState = parsed.state || parsed;
          if (persistedState && typeof persistedState === 'object') {
            const { useERPStore } = await import('./store/useERPStore');
            const { migrateERPState } = await import('./store/erpMigration');
            // Apply persist v3 migration: legacy voucher-type remap, AR/AP
            // control-account nesting, and legacy ledgerEntries trail removal.
            useERPStore.setState(migrateERPState(persistedState));
            Logger.info('Startup', 'ERP state rehydrated from SQLite key_value_store (v3 migration applied)');
          }
        } else {
          Logger.info('Startup', 'No persisted ERP state found (first launch)');
        }

        // ---- Access store rehydration + legacy key migration ----
        const accessValue = await SQLiteStorageAdapter.getItem('erp-access-storage');
        if (accessValue) {
          const parsed = JSON.parse(accessValue);
          const persistedState = parsed.state || parsed;
          if (persistedState && typeof persistedState === 'object') {
            const { useAccessStore } = await import('./store/useAccessStore');
            useAccessStore.setState(persistedState);
            Logger.info('Startup', 'Access state rehydrated from SQLite key_value_store');
          }
        } else {
          // Legacy: migrate old 'access-storage' localStorage key (pre-unification)
          let migrated = false;
          try {
            const legacyAccess = localStorage.getItem('access-storage');
            if (legacyAccess) {
              await SQLiteStorageAdapter.setItem('erp-access-storage', legacyAccess);
              localStorage.removeItem('access-storage');
              const parsed = JSON.parse(legacyAccess);
              const persistedState = parsed.state || parsed;
              if (persistedState && typeof persistedState === 'object') {
                const { useAccessStore } = await import('./store/useAccessStore');
                useAccessStore.setState(persistedState);
                Logger.info('Startup', 'Access state migrated from legacy localStorage key');
              }
              migrated = true;
            }
          } catch (_e) {
            // localStorage may be unavailable
          }
          if (!migrated) {
            Logger.info('Startup', 'No persisted access state found (first launch)');
          }
        }

        // ---- Settings store rehydration + localStorage migration ----
        const settingsValue = await SQLiteStorageAdapter.getItem('erp-settings');
        if (settingsValue) {
          // Settings already persisted — rehydrate
          const parsed = JSON.parse(settingsValue);
          const state = parsed.state || parsed;
          if (state && typeof state === 'object') {
            const { useSettingsStore } = await import('./store/useSettingsStore');
            useSettingsStore.setState(state);
            Logger.info('Startup', 'Settings rehydrated from SQLite');
          }
        } else {
          // Check if settings exist in localStorage (legacy) and migrate to SQLite
          let migrated = false;
          try {
            const localSettings = localStorage.getItem('erp-settings');
            if (localSettings) {
              await db.execute(
                'INSERT INTO key_value_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                ['erp-settings', localSettings]
              );
              Logger.info('Startup', 'Settings migrated from localStorage to SQLite');

              const parsed = JSON.parse(localSettings);
              const state = parsed.state || parsed;
              if (state && typeof state === 'object') {
                const { useSettingsStore } = await import('./store/useSettingsStore');
                useSettingsStore.setState(state);
                Logger.info('Startup', 'Settings rehydrated from localStorage after migration');
              }
              migrated = true;
            }
          } catch (_e) {
            // localStorage may not be available
          }

          if (!migrated) {
            Logger.info('Startup', 'No persisted settings found (first launch or clean start)');
          }
        }

        // ---- Log store rehydration ----
        // Merge, don't replace: bootstrap already wrote this session's startup
        // logs to the store (via the registered sink), so we prepend them to the
        // persisted history instead of clobbering them.
        const logsValue = await SQLiteStorageAdapter.getItem('erp-system-logs');
        if (logsValue) {
          const parsed = JSON.parse(logsValue);
          const persistedState = parsed.state || parsed;
          const persistedLogs = persistedState && typeof persistedState === 'object' && Array.isArray(persistedState.logs)
            ? persistedState.logs
            : [];
          if (persistedLogs.length > 0) {
            useLogStore.setState((state) => ({
              // Current-session entries are newest-first and belong first.
              logs: [...state.logs, ...persistedLogs].slice(0, 5000)
            }));
          }
          Logger.info('Startup', `Logs rehydrated from SQLite key_value_store (${persistedLogs.length} merged)`);
        }
      } else {
        Logger.info('Startup', 'DB not ready, skipping rehydration');
      }
    } catch (e: any) {
      Logger.warn('Startup', `Rehydration skipped: ${e.message}`);
    }

    // Auto-seed Chart of Accounts on first launch
    try {
      const { useERPStore } = await import('./store/useERPStore');
      const state = useERPStore.getState();
      if (state.accounts.length === 0 && state.accountSubtypes.length === 0) {
        Logger.info('Startup', 'No accounts found, auto-seeding Chart of Accounts...');
        const mod = await import('./lib/chartOfAccountsSeed');
        const { addAccountSubtype, addAccount } = state;
        const result = mod.seedDefaultChartOfAccounts(
          () => useERPStore.getState(),
          { addAccountSubtype, addAccount } as any
        );
        Logger.info('Startup', `Chart of Accounts seeded: ${result.created} accounts created`);
      }
    } catch (e: any) {
      Logger.warn('Startup', `Chart of Accounts auto-seed skipped: ${e.message}`);
    }

    Logger.info('Startup', 'Startup sequence complete, rendering UI...');
    
    // Signal that all stores have been rehydrated from SQLite.
    // AuthContext checks this flag and won't seedDefaults until it's set.
    // This prevents seedDefaults from firing before persist middleware
    // rehydration completes for stores without skipHydration.
    (window as any).__HYDRATION_COMPLETE__ = true;

    let root = (window as any).__REACT_ROOT__;
    if (!root) {
      root = createRoot(rootElement);
      (window as any).__REACT_ROOT__ = root;
    }

    root.render(
        <AppWrapper>
          <App />
        </AppWrapper>
    );
  } catch (error) {
    console.error('[Startup] Fatal Error during bootstrap:', error);
    Desktop.dialog.showErrorBox('Startup Failed', `The application failed to start:\n${(error as Error).message}`);
    rootElement.innerHTML = `
      <div style="padding: 2rem; color: #7f1d1d; background: #fef2f2; height: 100vh; font-family: sans-serif;">
        <h1>Fatal Startup Error</h1>
        <p>The application could not be initialized.</p>
        <pre style="background: white; padding: 1rem; border-radius: 4px; overflow: auto;">${(error as Error).stack || (error as Error).message}</pre>
        <button onclick="window.location.reload()" style="padding: 0.5rem 1rem; cursor: pointer;">Retry</button>
      </div>
    `;
  }
}

bootstrap();
