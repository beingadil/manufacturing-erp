import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import "./index.css";
import { APP_VERSION, IS_PRODUCTION } from "./config/version.ts";
import { dbService } from "./database/DatabaseService";
import { Desktop } from "./lib/desktop/DesktopInterop";
import { Logger } from "./lib/logger";
import { useLogStore } from "./store/useLogStore";

// ── Global error capture (diagnostics) ────────────────────────────────────
// Print unhandled rejections/errors with stacks so packaged-app crashes are
// visible in --enable-logging output instead of silently leaving a blank UI.
window.addEventListener("unhandledrejection", (event) => {
  const r: any = event.reason;
  console.error("[GLOBAL:unhandledrejection]", r && r.stack ? r.stack : String(r));
});
window.addEventListener("error", (event) => {
  const e: any = event.error;
  console.error("[GLOBAL:error]", e && e.stack ? e.stack : event.message);
});
// ──────────────────────────────────────────────────────────────────────────

// Top-level collections of the persisted ERP blob that must be arrays. If any
// is present but NOT an array, the blob is not the shape this build expects —
// rehydrating would silently DROP that whole collection (the migrator's
// defensive \`Array.isArray(x) ? x : []\` fallbacks overwrite the payload on
// return). Refusing to rehydrate preserves the data instead.
const ERP_ARRAY_KEYS = [
  'categories', 'materials', 'processors', 'suppliers', 'customers', 'purchases',
  'processingSends', 'processingReceipts', 'processorBills', 'processingStages',
  'products', 'sales', 'batches', 'inventoryMovements', 'accountSubtypes',
  'accounts', 'vouchers', 'journalEntries',
] as const;

function validateERPPayload(state: any): void {
  if (!state || typeof state !== 'object') {
    throw new Error('erp-storage payload is not an object');
  }
  for (const key of ERP_ARRAY_KEYS) {
    const v = state[key];
    if (v !== undefined && v !== null && !Array.isArray(v)) {
      throw new Error(`erp-storage: '${key}' is present but not an array — refusing to rehydrate (existing data preserved)`);
    }
  }
}

async function bootstrap() {
  const rootElement = document.getElementById("root")!;

  // Render the UI IMMEDIATELY — the login screen appears as fast as the
  // bundle loads. Store rehydration from SQLite runs in the background below;
  // zustand setState triggers re-renders as data arrives, and AuthContext
  // gates seedDefaults/session-restore on __HYDRATION_COMPLETE__ so the
  // timing fix (no re-seeding over user data) is preserved.
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

  // Suspend every persist write for the whole rehydration window. Without
  // this, the Logger/persist calls fired by the DB-init path itself UPSERT
  // erp-system-logs with session-only logs BEFORE the merge below reads the
  // historical row — and any later seed can overwrite the user's blob before
  // we know whether it loaded. Reads are never suspended; writes resume
  // below once the persisted rows have been read and reconciled.
  const { suspendStorageWrites, resumeStorageWrites } = await import('./database/sqlite/SQLiteStorageAdapter');
  suspendStorageWrites();

  let erpLoadState: 'ok' | 'absent' | 'failed' = 'absent';
  let legacyAccessToMigrate: string | null = null;
  let sqliteAdapter: typeof import('./database/sqlite/SQLiteStorageAdapter').SQLiteStorageAdapter | null = null;
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
    // Every store rehydrates in its OWN try/catch: one corrupt blob must
    // never cascade into the others being skipped — and skipped stores
    // must never be treated as "first launch" (see the seed gates below).
    try {
      if (dbService.isReady()) {
        const { SQLiteStorageAdapter } = await import('./database/sqlite/SQLiteStorageAdapter');
        sqliteAdapter = SQLiteStorageAdapter;

        // ---- Settings store rehydration ----
        const settingsValue = await SQLiteStorageAdapter.getItem('erp-settings');
        if (settingsValue) {
          try {
            const parsed = JSON.parse(settingsValue);
            const state = parsed.state || parsed;
            if (!state || typeof state !== 'object') {
              throw new Error('erp-settings blob is not an object');
            }
            const { useSettingsStore } = await import('./store/useSettingsStore');
            useSettingsStore.setState(state);
            Logger.info('Startup', 'Settings rehydrated from SQLite');
          } catch (e: any) {
            (window as any).__SETTINGS_REHYDRATION_FAILED__ = true;
            console.error('[Startup] Settings rehydration FAILED — existing settings preserved', e);
            Logger.error('Startup', `Settings rehydration FAILED, existing data preserved: ${e.message}`);
          }
        } else {
          Logger.info('Startup', 'No persisted settings found (first launch or clean start)');
        }

        // ---- ERP store rehydration ----
        const erpValue = await SQLiteStorageAdapter.getItem('erp-storage');
        if (erpValue) {
          try {
            const parsed = JSON.parse(erpValue);
            const persistedState = parsed.state || parsed;
            if (!persistedState || typeof persistedState !== 'object') {
              throw new Error('erp-storage blob is not an object');
            }
            // Fail-closed BEFORE any state write: never rehydrate a payload
            // whose collections are the wrong type.
            validateERPPayload(persistedState);
            const { useERPStore } = await import('./store/useERPStore');
            const { migrateERPState } = await import('./store/erpMigration');
            const { fixHistoricalPostings } = await import('./lib/accounting/historicalPostingFix');
            const { fixReheadedPurchases } = await import('./store/reheadedPurchaseFix');

            // Apply persist v3 migration: legacy voucher-type remap, AR/AP
            // control-account nesting, and legacy ledgerEntries trail removal.
            // Guard the migration itself: a throw here previously skipped ALL
            // rehydration and let the CoA auto-seed overwrite the blob.
            const migrated = migrateERPState(persistedState);
            validateERPPayload(migrated);

            // One-time data-fix for historical postings — best-effort, never
            // blocks opening the app (the fix simply runs again next launch).
            let fixedState = migrated;
            let fixReport: any = null;
            try {
              const fixed = fixHistoricalPostings(migrated);
              fixedState = fixed.state;
              fixReport = fixed.report;
            } catch (e: any) {
              Logger.warn('Startup', `Historical postings fix skipped: ${e.message}`);
            }

            // Repair purchase entries re-headed to a different material — the
            // batch (and its stock) moves onto the purchase's chosen head.
            // Batches that reached the processor pipeline are left untouched.
            let reheadReport: any = null;
            try {
              const reheaded = fixReheadedPurchases(fixedState);
              fixedState = reheaded.state;
              reheadReport = reheaded.report;
            } catch (e: any) {
              Logger.warn('Startup', `Re-headed purchase repair skipped: ${e.message}`);
            }
            validateERPPayload(fixedState);

            useERPStore.setState(fixedState);
            erpLoadState = 'ok';
            Logger.info('Startup', `ERP state rehydrated from SQLite key_value_store (v3 migration applied; postings fix: ${fixReport ? `${fixReport.purchasesRemapped} purchases remapped, ${fixReport.salesCogsAdded} sales COGS back-filled, ${fixReport.salesSkippedNoCost} skipped-no-cost` : 'skipped'}; purchase repair: ${reheadReport ? `${reheadReport.batchesRehead} head(s) moved, ${reheadReport.supplierSynced} supplier(s) synced, ${reheadReport.movementsRepaired} movement qty repaired, ${reheadReport.balancesReplayed} material balance replay(s), ${reheadReport.pipelineSkipped} pipeline-skipped` : 'skipped'})`);
          } catch (e: any) {
            erpLoadState = 'failed';
            (window as any).__ERP_REHYDRATION_FAILED__ = true;
            // LOUD, not a warn buried in diagnostics — and crucially do NOT
            // seed defaults over the user's data.
            console.error('[Startup] ERP rehydration FAILED — existing ERP data was NOT loaded and NOT overwritten. Restore from backup.', e);
            Logger.error('Startup', `ERP rehydration FAILED, existing data preserved: ${e.message}`);
            Desktop.dialog.showErrorBox(
              'Your data could not be loaded',
              `The application could not read your saved ERP data (${e.message}). The database was NOT overwritten and your data is preserved.\n\nClose the app and restore from your most recent backup (Settings → System Maintenance → Restore from file) before entering new records.`
            );
          }
        } else {
          erpLoadState = 'absent';
          Logger.info('Startup', 'No persisted ERP state found (first launch)');
        }

        // ---- Access store rehydration + legacy key migration ----
        const accessValue = await SQLiteStorageAdapter.getItem('erp-access-storage');
        if (accessValue) {
          try {
            const parsed = JSON.parse(accessValue);
            const persistedState = parsed.state || parsed;
            if (!persistedState || typeof persistedState !== 'object') {
              throw new Error('erp-access-storage blob is not an object');
            }
            const { useAccessStore } = await import('./store/useAccessStore');
            useAccessStore.setState(persistedState);
            Logger.info('Startup', 'Access state rehydrated from SQLite key_value_store');
          } catch (e: any) {
            (window as any).__ACCESS_REHYDRATION_FAILED__ = true;
            console.error('[Startup] Access rehydration FAILED — existing users/permissions preserved', e);
            Logger.error('Startup', `Access rehydration FAILED, existing data preserved: ${e.message}`);
          }
        } else {
          // Legacy: migrate old 'access-storage' localStorage key (pre-unification).
          // The adapter is suspended right now — defer the SQLite write until
          // after resumeStorageWrites().
          let migrated = false;
          try {
            const legacyAccess = localStorage.getItem('access-storage');
            if (legacyAccess) {
              const parsed = JSON.parse(legacyAccess);
              const persistedState = parsed.state || parsed;
              if (!persistedState || typeof persistedState !== 'object') {
                throw new Error('legacy access-storage blob is not an object');
              }
              const { useAccessStore } = await import('./store/useAccessStore');
              useAccessStore.setState(persistedState);
              legacyAccessToMigrate = legacyAccess;
              localStorage.removeItem('access-storage');
              Logger.info('Startup', 'Access state migrated from legacy localStorage key');
              migrated = true;
            }
          } catch (_e) {
            // localStorage unavailable or corrupt — non-fatal
          }
          if (!migrated) {
            Logger.info('Startup', 'No persisted access state found (first launch)');
          }
        }

        // ---- Log store rehydration ----
        // Merge, don't replace: bootstrap already accumulated this session's
        // logs in memory (writes were suspended so none of them clobbered the
        // persisted row), so we prepend them to the persisted history.
        const logsValue = await SQLiteStorageAdapter.getItem('erp-system-logs');
        if (logsValue) {
          try {
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
          } catch (e: any) {
            console.error('[Startup] Log rehydration FAILED — historical logs preserved in database', e);
          }
        }
      } else {
        // DB not ready: fail CLOSED. Never seed defaults over a database we
        // failed to read, and never let AuthContext seed the access blob.
        (window as any).__ERP_REHYDRATION_FAILED__ = true;
        (window as any).__ACCESS_REHYDRATION_FAILED__ = true;
        (window as any).__SETTINGS_REHYDRATION_FAILED__ = true;
        console.warn('[Startup] DB not ready, skipping rehydration — existing data preserved');
      }
    } catch (e: any) {
      (window as any).__ERP_REHYDRATION_FAILED__ = true;
      (window as any).__ACCESS_REHYDRATION_FAILED__ = true;
      (window as any).__SETTINGS_REHYDRATION_FAILED__ = true;
      console.error('[Startup] Rehydration failed — existing data preserved', e);
    }

    // Writes resume now — mutations from this point persist normally. The
    // deferred legacy-access write happens here, once the adapter accepts them.
    resumeStorageWrites();
    if (legacyAccessToMigrate && sqliteAdapter) {
      try {
        await sqliteAdapter.setItem('erp-access-storage', legacyAccessToMigrate);
      } catch (_e) {
        // best-effort
      }
    }

    // Auto-seed Chart of Accounts — ONLY on a genuine first install (no
    // persisted blob). If a blob existed but failed to load, seeding would
    // overwrite the user's accounts with defaults, so we refuse and rely on
    // the loud error shown above (backup/restore is the recovery path).
    const firstInstall = erpLoadState === 'absent'
      && !(window as any).__ERP_REHYDRATION_FAILED__;
    try {
      if (firstInstall) {
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
      } else {
        Logger.info('Startup', `Chart of Accounts auto-seed skipped (erpLoadState=${erpLoadState})`);
      }
    } catch (e: any) {
      Logger.warn('Startup', `Chart of Accounts auto-seed skipped: ${e.message}`);
    }

    // Auto-seed the Processing Stage master ONLY on a genuine first install —
    // same fail-closed rule as the Chart of Accounts above.
    try {
      if (firstInstall) {
        const { useERPStore } = await import('./store/useERPStore');
        const state = useERPStore.getState();
        if ((state.processingStages || []).length === 0) {
          Logger.info('Startup', 'No processing stages found, seeding default chain...');
          const mod = await import('./lib/processing/processingStageSeed');
          const result = mod.seedDefaultProcessingStages(
            () => useERPStore.getState(),
            { addProcessingStage: state.addProcessingStage, updateProcessingStage: state.updateProcessingStage } as any
          );
          Logger.info('Startup', result.skipped
            ? 'Processing stages already present'
            : `Processing stages seeded: ${result.created} created`);
        }
      }
    } catch (e: any) {
      Logger.warn('Startup', `Processing stage seed skipped: ${e.message}`);
    }

    // Dev-only: seed realistic demo data across ALL modules (never in
    // production — Vite replaces import.meta.env.DEV with false at build time
    // and tree-shakes this whole branch, so the installer ships no demo data).
    if (import.meta.env.DEV) {
      try {
        // Never inject demo data when a rehydration failure is in play —
        // the store would be empty and persist would overwrite the user's blob.
        if (firstInstall) {
          const mod = await import('./lib/demo/demoSeed');
          // Always expose reset helpers in dev so a fresh demo can be regenerated.
          (window as any).__seedDemoData = mod.seedDemoData;
          (window as any).__resetDemoData = mod.resetDemoData;
          const result = mod.seedDemoData();
          Logger.info('Startup', result.seeded
            ? 'Dev demo data seeded across all modules'
            : `Dev demo data skipped: ${result.reason}`);
        } else {
          Logger.info('Startup', 'Dev demo seed skipped (existing or failed rehydration — data preserved)');
        }
      } catch (e: any) {
        Logger.warn('Startup', `Dev demo data seed skipped: ${e.message}`);
      }
    }

    Logger.info('Startup', 'Startup sequence complete, rendering UI...');
    
    // Signal that all stores have been rehydrated from SQLite.
    // AuthContext checks this flag and won't seedDefaults until it's set.
    // This prevents seedDefaults from firing before persist middleware
    // rehydration completes for stores without skipHydration.
    (window as any).__HYDRATION_COMPLETE__ = true;
  } catch (error) {
    // Fail closed: resume writes, mark every rehydration as failed so
    // AuthContext never seeds defaults over the existing access blob, and
    // never report a half-initialized app as healthy.
    try { resumeStorageWrites(); } catch { /* already resumed */ }
    (window as any).__ERP_REHYDRATION_FAILED__ = true;
    (window as any).__ACCESS_REHYDRATION_FAILED__ = true;
    (window as any).__SETTINGS_REHYDRATION_FAILED__ = true;
    console.error('[Startup] Fatal Error during bootstrap:', error);
    Desktop.dialog.showErrorBox('Startup Failed', `The application failed to start:\n${(error as Error).message}`);
    // Theme-aware fallback: uses the app's CSS variables so the crash screen
    // is readable in both light and dark mode (no hardcoded light colors).
    rootElement.innerHTML = `
      <div style="padding: 2rem; color: hsl(var(--foreground)); background: hsl(var(--background)); height: 100vh; font-family: sans-serif;">
        <h1 style="color: hsl(var(--destructive));">Fatal Startup Error</h1>
        <p>The application could not be initialized.</p>
        <pre style="background: hsl(var(--muted)); color: hsl(var(--foreground)); padding: 1rem; border-radius: 4px; overflow: auto;">${(error as Error).stack || (error as Error).message}</pre>
        <button onclick="window.location.reload()" style="padding: 0.5rem 1rem; cursor: pointer; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border: none; border-radius: 4px;">Retry</button>
      </div>
    `;
  }
}

bootstrap();
