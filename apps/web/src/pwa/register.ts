/**
 * PWA: installable app + automatic updates. The service worker caches the app shell and assets; when a new build
 * is deployed the SW detects it, downloads it in the background and we offer "Atualizar agora".
 */
type Listener = () => void;
let waiting: ServiceWorker | null = null;
let installEvt: (Event & { prompt(): Promise<void>; userChoice: Promise<unknown> }) | null = null;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());
export function onPwaChange(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function updateAvailable() {
  return !!waiting;
}
export function canInstall() {
  return !!installEvt;
}
export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
export async function promptInstall() {
  if (!installEvt) return false;
  await installEvt.prompt();
  installEvt = null;
  notify();
  return true;
}
export function applyUpdate() {
  if (!waiting) return;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}
export function registerSW() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvt = e as typeof installEvt;
    notify();
  });
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      const track = (w: ServiceWorker | null) => {
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = w;
            notify();
          }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) {
        waiting = reg.waiting;
        notify();
      }
      reg.addEventListener('updatefound', () => track(reg.installing));
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
      // check for updates periodically and when the app regains focus
      setInterval(() => void reg.update(), 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => !document.hidden && void reg.update());
    } catch (e) {
      console.warn('SW registration failed', e);
    }
  });
}
