import React, { useState } from 'react';
import { Download, Share } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Button, ModalShell } from './ui/Modal';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install, dismiss } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  if (isInstalled) return null;

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      await install();
    } finally {
      setIsInstalling(false);
    }
  };

  if (isInstallable) {
    return (
      <Button onClick={handleInstall} disabled={isInstalling} className="shrink-0">
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">{isInstalling ? 'Installing…' : 'Install app'}</span>
        <span className="sm:hidden">Install</span>
      </Button>
    );
  }

  if (!isIOS) return null;

  return (
    <>
      <Button onClick={() => setShowIOSGuide(true)} className="shrink-0">
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Install app</span>
        <span className="sm:hidden">Install</span>
      </Button>

      {showIOSGuide && (
        <ModalShell
          title="Install on iPhone or iPad"
          subtitle="Adds PhosphorGrid to your home screen and runs it full-screen offline."
          size="sm"
          onClose={() => setShowIOSGuide(false)}
          closeLabel="Close installation guide"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  dismiss();
                  setShowIOSGuide(false);
                }}
              >
                Don't show this again
              </Button>
              <Button variant="primary" onClick={() => setShowIOSGuide(false)}>
                Got it
              </Button>
            </>
          }
        >
          <ol className="space-y-3 p-4 text-sm text-[var(--pg-muted)] sm:p-5">
            <li className="flex items-start gap-2.5">
              <span className="font-mono-grid text-[var(--pg-accent)]">1.</span>
              <span>
                Tap the <strong className="text-[var(--pg-text)]">Share</strong>{' '}
                <Share className="inline h-3.5 w-3.5 text-[var(--pg-accent)]" aria-hidden="true" />{' '}
                button in Safari.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="font-mono-grid text-[var(--pg-accent)]">2.</span>
              <span>
                Scroll down and choose{' '}
                <strong className="text-[var(--pg-text)]">Add to Home Screen</strong>.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="font-mono-grid text-[var(--pg-accent)]">3.</span>
              <span>Launch it from the home screen — the studio then works offline.</span>
            </li>
          </ol>
        </ModalShell>
      )}
    </>
  );
};
