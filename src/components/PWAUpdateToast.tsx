import React from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate';

/**
 * Non-blocking service-worker status chip. The studio's status rail positions
 * it above the mobile thumb bar and inside the safe area.
 */
export const PWAUpdateToast: React.FC = () => {
  const { needsRefresh, isOfflineReady, applyUpdate, dismissUpdate, acknowledgeOffline } =
    useServiceWorkerUpdate();

  if (!needsRefresh && !isOfflineReady) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-elevated)]/95 px-3 py-2 shadow-xl backdrop-blur"
    >
      {needsRefresh ? (
        <>
          <Download className="h-4 w-4 shrink-0 text-[var(--pg-accent)]" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-xs text-[var(--pg-text)]">A new version is ready</p>
          <button
            type="button"
            onClick={applyUpdate}
            className="pg-tap inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded bg-[var(--pg-accent)] px-2.5 text-xs font-semibold text-[var(--pg-accent-ink)]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reload</span>
          </button>
          <button
            type="button"
            onClick={dismissUpdate}
            aria-label="Dismiss update notice"
            className="pg-tap flex h-8 w-8 shrink-0 items-center justify-center rounded text-[var(--pg-muted)] hover:text-[var(--pg-text)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <p className="min-w-0 flex-1 text-xs text-[var(--pg-muted)]">
            Ready offline. The studio now works without a network.
          </p>
          <button
            type="button"
            onClick={acknowledgeOffline}
            aria-label="Dismiss offline notice"
            className="pg-tap flex h-8 w-8 shrink-0 items-center justify-center rounded text-[var(--pg-muted)] hover:text-[var(--pg-text)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
};
