import { PackageX, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';

interface LegacyInstallInfo {
  runningFromLegacy: boolean;
  legacyInstallPaths: string[];
  currentExePath: string;
  currentDir: string;
  isWindows: boolean;
}

const DISMISS_KEY_PREFIX = 'update-migration-notice-dismissed';

export default function UpdateMigrationNotice() {
  const [info, setInfo] = useState<LegacyInstallInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const isElectron = typeof window !== 'undefined' && !!window.electronDB;

  // Dismissal is keyed per install path so the notice reappears if the app is
  // later launched from a different copy (e.g. the legacy per-machine one),
  // and stays visible until the old copy is actually gone.
  const dismissalKey = info ? `${DISMISS_KEY_PREFIX}:${info.currentDir}` : null;

  useEffect(() => {
    if (!isElectron) return;
    window.electronDB
      ?.checkLegacyInstall?.()
      .then((res) => {
        if (res?.success && res.data) {
          setInfo(res.data);
          const key = `${DISMISS_KEY_PREFIX}:${res.data.currentDir}`;
          if (localStorage.getItem(key) === '1') setDismissed(true);
        }
      })
      .catch(() => {});
  }, [isElectron]);

  const handleDismiss = useCallback(() => {
    if (dismissalKey) localStorage.setItem(dismissalKey, '1');
    setDismissed(true);
  }, [dismissalKey]);

  const needsNotice =
    !!info && (info.runningFromLegacy || (info.legacyInstallPaths?.length ?? 0) > 0);

  if (!needsNotice || dismissed) return null;

  const legacyPaths =
    info.legacyInstallPaths?.length > 0 ? info.legacyInstallPaths : [info.currentDir];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="fixed top-20 left-1/2 -translate-x-1/2 z-[9998] w-[min(92vw,680px)]"
      >
        <div className="relative overflow-hidden rounded-2xl border border-amber-300 dark:border-amber-700 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/60 dark:to-orange-950/40 shadow-2xl backdrop-blur-xl">
          {/* Accent stripe */}
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400" />

          <div className="relative p-5">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <TriangleAlert className="w-6 h-6" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-amber-900 dark:text-amber-100 tracking-tight">
                  Update migration — old copy detected
                </p>
                <div className="mt-1.5 text-[13px] leading-relaxed text-amber-900/80 dark:text-amber-100/80 space-y-2">
                  {info.runningFromLegacy ? (
                    <p>
                      You're running the <b>older "for all users" copy</b> installed in
                      Program Files. New versions of this app install only for your user
                      account — running both creates a duplicate app.
                    </p>
                  ) : (
                    <p>
                      An <b>older copy</b> of Manufacturing ERP is still installed in
                      Program Files. It can show up as a second app next to this one.
                    </p>
                  )}

                  {info.runningFromLegacy && (
                    <p>
                      After uninstalling the old copy, open the <b>new version</b>{' '}
                      installed for your user account (look for it in your Start menu —
                      this updater installs it automatically).
                    </p>
                  )}

                  <p className="flex items-start gap-1.5">
                    <PackageX className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      Please uninstall it once: open <b>Windows Settings → Apps →
                      Installed apps</b>, find <b>Manufacturing ERP</b>, and click
                      Uninstall. Then use this copy going forward.
                    </span>
                  </p>

                  <p className="flex items-start gap-1.5">
                    <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      Your data is safe — it lives in{' '}
                      <code className="text-[11px] bg-amber-100/70 dark:bg-amber-900/40 px-1 py-0.5 rounded">
                        %APPDATA%\Manufacturing ERP
                      </code>{' '}
                      and is never touched by uninstalling the old copy.
                    </span>
                  </p>

                  {legacyPaths.length > 0 && (
                    <p className="text-[11px] font-mono text-amber-700/70 dark:text-amber-300/60 truncate">
                      {legacyPaths[0]}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={handleDismiss}
                className="flex-shrink-0 p-1.5 rounded-lg text-amber-600/70 hover:text-amber-900 dark:hover:text-amber-100 hover:bg-amber-100/80 dark:hover:bg-amber-900/50 transition-colors"
                aria-label="Dismiss migration notice"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
