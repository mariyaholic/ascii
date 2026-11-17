import { useCallback, useEffect, useState } from 'react';
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  isIosDevice,
  isStandaloneDisplay,
  subscribeInstallPrompt,
} from '../lib/installPrompt';

const DISMISS_KEY = 'pg.installDismissedAt.v1';
const SNOOZE_MS = 1000 * 60 * 60 * 24 * 14;

function readDismissedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function usePWAInstall() {
  const [hasPrompt, setHasPrompt] = useState<boolean>(() => getDeferredInstallPrompt() !== null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => isStandaloneDisplay());
  const [isIOS] = useState<boolean>(() => isIosDevice());
  const [isSnoozed, setIsSnoozed] = useState<boolean>(() => {
    const dismissedAt = readDismissedAt();
    return dismissedAt !== null && Date.now() - dismissedAt < SNOOZE_MS;
  });

  useEffect(() => {
    const unsubscribe = subscribeInstallPrompt((event) => setHasPrompt(event !== null));
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');

    const syncInstalled = () => setIsInstalled(isStandaloneDisplay());
    standaloneQuery.addEventListener?.('change', syncInstalled);
    window.addEventListener('appinstalled', syncInstalled);

    return () => {
      unsubscribe();
      standaloneQuery.removeEventListener?.('change', syncInstalled);
      window.removeEventListener('appinstalled', syncInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private mode: keep the in-memory dismissal for this session only.
    }
    setIsSnoozed(true);
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    const prompt = getDeferredInstallPrompt();
    if (!prompt) return false;

    await prompt.prompt();
    const { outcome } = await prompt.userChoice;

    if (outcome === 'accepted') {
      clearDeferredInstallPrompt();
      setIsInstalled(true);
      return true;
    }

    dismiss();
    return false;
  }, [dismiss]);

  return {
    /** Chrome/Edge/Android: a real install prompt is queued and can be shown. */
    isInstallable: hasPrompt && !isInstalled && !isSnoozed,
    isInstalled,
    isIOS: isIOS && !isInstalled && !isSnoozed,
    install,
    dismiss,
  };
}
