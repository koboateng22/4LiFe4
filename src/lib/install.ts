/**
 * "Add 4Life to your home screen".
 * Browsers fire `beforeinstallprompt` once, early, so it is caught here as
 * soon as the app loads and used later by the Instant EMS screen.
 */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach(f => f());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach(f => f());
  });
}

export const canPromptInstall = () => !!deferred;
export const isInstalled = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const isIOS = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  listeners.forEach(f => f());
  return outcome === 'accepted';
}

export function onInstallChange(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}
