import { useCallback, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

type UpdateListener = () => void;

let registered = false;
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;
let updatePending = false;
let offlineReady = false;
const updateListeners = new Set<UpdateListener>();

function notify() {
  for (const listener of updateListeners) listener();
}

function register() {
  if (registered || typeof window === 'undefined') return;
  registered = true;

  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      updatePending = true;
      notify();
    },
    onOfflineReady() {
      offlineReady = true;
      notify();
    },
    onRegisteredSW(_swUrl, registration) {
      // Poll for a new build at most once an hour; the studio is long-lived in
      // installed windows, where a full reload otherwise never happens.
      if (!registration) return;
      window.setInterval(() => {
        registration.update().catch(() => undefined);
      }, 60 * 60 * 1000);
    },
  });
}

/**
 * Prompt-based service worker updates. A background auto-update can swap the
 * worker under a running render session, so the studio asks before reloading.
 */
export function useServiceWorkerUpdate() {
  const [needsRefresh, setNeedsRefresh] = useState(updatePending);
  const [isOfflineReady, setIsOfflineReady] = useState(offlineReady);

  useEffect(() => {
    register();
    const listener: UpdateListener = () => {
      setNeedsRefresh(updatePending);
      setIsOfflineReady(offlineReady);
    };
    updateListeners.add(listener);
    listener();
    return () => {
      updateListeners.delete(listener);
    };
  }, []);

  const applyUpdate = useCallback(async () => {
    updatePending = false;
    setNeedsRefresh(false);
    await updateServiceWorker?.(true);
  }, []);

  const dismissUpdate = useCallback(() => {
    updatePending = false;
    setNeedsRefresh(false);
  }, []);

  const acknowledgeOffline = useCallback(() => {
    offlineReady = false;
    setIsOfflineReady(false);
  }, []);

  return { needsRefresh, isOfflineReady, applyUpdate, dismissUpdate, acknowledgeOffline };
}
