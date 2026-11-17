/**
 * Captures the Chromium `beforeinstallprompt` event as soon as the module is
 * imported (before React mounts), so the install affordance is never lost when
 * the app boots inside an already-installed or slow-starting shell.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type Listener = (event: BeforeInstallPromptEvent | null) => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(deferredPrompt);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's own mini-infobar out of the way; the studio exposes
    // install in its header and in the mobile sheet instead.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iPadOS 13+ reports a desktop Safari user agent, so check for touch points too. */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return true;
  return ua.includes('macintosh') && navigator.maxTouchPoints > 1;
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function clearDeferredInstallPrompt() {
  deferredPrompt = null;
  emit();
}

export function subscribeInstallPrompt(listener: Listener) {
  listeners.add(listener);
  listener(deferredPrompt);
  return () => {
    listeners.delete(listener);
  };
}
