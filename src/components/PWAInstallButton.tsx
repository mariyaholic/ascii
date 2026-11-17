import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-elevated)] px-3 py-2 text-xs font-medium text-[var(--pg-text)] hover:border-[var(--pg-accent)] hover:text-[var(--pg-accent)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-2 rounded-md border border-[var(--pg-border-strong)] bg-[var(--pg-elevated)] px-3 py-2 text-xs font-medium text-[var(--pg-text)] hover:border-[var(--pg-accent)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-sm rounded-lg border border-[var(--pg-border-strong)] bg-[var(--pg-surface)] p-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-[var(--pg-text)]">
                  Install on iPhone or iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1.5 rounded text-[var(--pg-muted)] hover:text-[var(--pg-text)]"
                  aria-label="Close installation guide"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-[var(--pg-muted)]">
                <li className="flex items-center gap-2">
                  <span className="font-mono-grid text-[var(--pg-accent)]">1.</span>
                  <span>
                    Tap the <strong className="text-[var(--pg-text)]">Share</strong>{' '}
                    <Share className="inline w-3.5 h-3.5 text-[var(--pg-accent)]" /> button in Safari.
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="font-mono-grid text-[var(--pg-accent)]">2.</span>
                  <span>
                    Scroll down and select <strong className="text-[var(--pg-text)]">Add to Home Screen</strong>.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-md bg-[var(--pg-accent)] py-2 text-xs font-semibold text-[var(--pg-accent-ink)] hover:opacity-90 transition-opacity cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
