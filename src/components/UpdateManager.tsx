import { AlertCircle, CheckCircle, Download, RotateCw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { APP_VERSION } from '../config/version';

interface UpdateStatus {
  status: 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error';
  message: string;
  percent?: number;
  silent?: boolean;
  transferred?: number;
  total?: number;
  info?: { version: string; releaseDate?: string };
}


export default function UpdateManager() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const isElectron = typeof window !== 'undefined' && !!window.electronDB;

  const handleStatus = useCallback((newStatus: UpdateStatus) => {
    // Don't show silent errors or normal "up-to-date" messages as toast
    if (newStatus.status === 'error' && newStatus.silent) {
      return;
    }
    setStatus(newStatus);
    setDismissed(false);
    // Auto-dismiss "up-to-date" after 4 seconds
    if (newStatus.status === 'up-to-date') {
      setTimeout(() => {
        setDismissed(true);
        // Clear after animation
        setTimeout(() => setStatus(null), 300);
      }, 4000);
    }
  }, []);

  useEffect(() => {
    if (isElectron && window.electronDB?.onUpdateStatus) {
      window.electronDB.onUpdateStatus(handleStatus);
      return () => {/* cleanup handled by main process */};
    }
  }, [isElectron, handleStatus]);

  const handleCheckNow = useCallback(async () => {
    if (window.electronDB?.checkForUpdates) {
      await window.electronDB.checkForUpdates();
    }
  }, []);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    if (window.electronDB?.installUpdate) {
      await window.electronDB.installUpdate();
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setTimeout(() => setStatus(null), 300);
  }, []);

  if (!isElectron || !status) return null;

  const isUpToDate = status.status === 'up-to-date';

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-6 right-6 z-[9999] max-w-sm w-full"
        >
          <div className={`
            relative overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl
            ${isUpToDate
              ? 'bg-emerald-50/95 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
              : 'bg-white/95 dark:bg-gray-900/95 border-gray-200 dark:border-gray-700'
            }
          `}>
            {/* Background gradient accent */}
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/[0.02] dark:to-white/[0.02] pointer-events-none" />

            <div className="relative p-4">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Icon */}
                  <div className={`
                    flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
                    ${status.status === 'checking' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400' : ''}
                    ${status.status === 'available' ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400' : ''}
                    ${status.status === 'up-to-date' ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400' : ''}
                    ${status.status === 'downloading' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400' : ''}
                    ${status.status === 'downloaded' ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400' : ''}
                    ${status.status === 'error' ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400' : ''}
                  `}>
                    {status.status === 'checking' && <RotateCw className="w-5 h-5 animate-spin" />}
                    {status.status === 'available' && <Download className="w-5 h-5" />}
                    {status.status === 'up-to-date' && <CheckCircle className="w-5 h-5" />}
                    {status.status === 'downloading' && <Download className="w-5 h-5" />}
                    {status.status === 'downloaded' && <CheckCircle className="w-5 h-5" />}
                    {status.status === 'error' && <AlertCircle className="w-5 h-5" />}
                  </div>

                  {/* Text */}
                  <div className="min-w-0">
                    <p className={`
                      text-sm font-semibold truncate
                      ${isUpToDate ? 'text-emerald-800 dark:text-emerald-200' : 'text-gray-900 dark:text-gray-100'}
                    `}>
                      {status.status === 'checking' && 'Checking for Updates'}
                      {status.status === 'available' && `Update Available`}
                      {status.status === 'up-to-date' && `Up to Date`}
                      {status.status === 'downloading' && 'Downloading Update'}
                      {status.status === 'downloaded' && 'Update Ready'}
                      {status.status === 'error' && 'Update Error'}
                    </p>
                    <p className={`
                      text-xs mt-0.5 truncate
                      ${isUpToDate ? 'text-emerald-600/70 dark:text-emerald-300/70' : 'text-gray-500 dark:text-gray-400'}
                    `}>
                      {status.status === 'checking' && 'Checking for new version…'}
                      {status.status === 'available' && `v${status.info?.version || '??'} is ready to download`}
                      {status.status === 'up-to-date' && `v${APP_VERSION} — latest version`}
                      {status.status === 'downloading' && `${status.percent || 0}% complete`}
                      {status.status === 'downloaded' && `v${status.info?.version || '??'} downloaded`}
                      {status.status === 'error' && status.message}
                    </p>
                  </div>
                </div>

                {/* Close button */}
                {!isUpToDate && (
                  <button
                    onClick={handleDismiss}
                    className="flex-shrink-0 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Progress bar */}
              {status.status === 'downloading' && typeof status.percent === 'number' && (
                <div className="mt-3">
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${status.percent}%` }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 text-right">
                    {status.transferred ? `${(status.transferred / 1024 / 1024).toFixed(1)} MB` : ''}
                    {status.total ? ` / ${(status.total / 1024 / 1024).toFixed(1)} MB` : ''}
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="mt-3 flex items-center gap-2">
                {status.status === 'downloaded' && (
                  <button
                    onClick={handleInstall}
                    disabled={installing}
                    className={`
                      flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-lg
                      transition-all duration-200
                      ${installing
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 hover:shadow-xl active:scale-[0.97]'
                      }
                    `}
                  >
                    {installing ? 'Restarting...' : 'Restart & Update'}
                  </button>
                )}

                {status.status === 'available' && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                    Downloading in background…
                  </p>
                )}

                {status.status === 'checking' && (
                  <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}

                {status.status === 'error' && (
                  <button
                    onClick={handleCheckNow}
                    className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors active:scale-[0.97]"
                  >
                    Retry Check
                  </button>
                )}

                {/* Manual check button (subtle, always visible for non-progress states) */}
                {!['downloading', 'downloaded', 'checking'].includes(status.status) && (
                  <button
                    onClick={handleCheckNow}
                    className="p-2 rounded-lg text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title="Check for updates"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
