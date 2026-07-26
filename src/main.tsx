import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import "./index.css";
import { Desktop } from "./lib/desktop/DesktopInterop";
import { Logger } from "./store/useLogStore";
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

    // Rehydrate Zustand stores from persisted key_value_store blob
    try {
      if (dbService.isReady()) {
        const db = dbService.getAdapter();

        // ---- ERP store rehydration ----
        const erpRow = await db.queryOne<{ value: string }>(
          'SELECT value FROM key_value_store WHERE key = ?',
          ['erp-storage']
        );
        if (erpRow && erpRow.value) {
          const parsed = JSON.parse(erpRow.value);
          const persistedState = parsed.state || parsed;
          if (persistedState && typeof persistedState === 'object') {
            const { useERPStore } = await import('./store/useERPStore');
            useERPStore.setState(persistedState);
            Logger.info('Startup', 'ERP state rehydrated from SQLite key_value_store');
          }
        } else {
          Logger.info('Startup', 'No persisted ERP state found (first launch)');
        }

        // ---- Access store rehydration ----
        const accessRow = await db.queryOne<{ value: string }>(
          'SELECT value FROM key_value_store WHERE key = ?',
          ['erp-access-storage']
        );
        if (accessRow && accessRow.value) {
          const parsed = JSON.parse(accessRow.value);
          const persistedState = parsed.state || parsed;
          if (persistedState && typeof persistedState === 'object') {
            const { useAccessStore } = await import('./store/useAccessStore');
            useAccessStore.setState(persistedState);
            Logger.info('Startup', 'Access state rehydrated from SQLite key_value_store');
          }
        } else {
          Logger.info('Startup', 'No persisted access state found (first launch)');
        }

        // ---- Settings store rehydration + localStorage migration ----
        const settingsRow = await db.queryOne<{ value: string }>(
          'SELECT value FROM key_value_store WHERE key = ?',
          ['erp-settings']
        );
        if (settingsRow && settingsRow.value) {
          // Settings already in SQLite — rehydrate
          const parsed = JSON.parse(settingsRow.value);
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
