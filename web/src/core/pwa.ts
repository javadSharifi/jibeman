import { registerSW } from 'virtual:pwa-register';
import { APP_VERSION_INFO, type AppVersionInfo } from './version';

export interface PwaUpdateState {
  hasUpdate: boolean;
  availableVersion: string | null;
  isStandalone: boolean;
}

type UpdateCallback = (state: PwaUpdateState) => void;

const CHECK_THROTTLE_MS = 10_000;
const PERIODIC_CHECK_MS = 15 * 60 * 1000;

function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    nav.standalone === true
  );
}

class PwaManager {
  private updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
  private updateListeners: Set<UpdateCallback> = new Set();
  private registration: ServiceWorkerRegistration | null = null;
  private initialized = false;
  private applyingUpdate = false;
  private inFlightCheck: Promise<boolean> | null = null;
  private lastCheckAt = 0;

  public hasUpdate = false;
  public availableVersion: string | null = null;

  init() {
    if (typeof window === 'undefined' || this.initialized) return;
    this.initialized = true;

    if ('serviceWorker' in navigator) {
      const hadController = Boolean(navigator.serviceWorker.controller);

      this.updateSW = registerSW({
        immediate: true,
        onNeedRefresh: () => {
          console.log('[PWA] New version detected and ready to install.');
          this.hasUpdate = true;
          this.notifyListeners();
          void this.fetchServerVersion();
        },
        onOfflineReady: () => {
          console.log('[PWA] App is ready for offline use.');
        },
        onRegisteredSW: (_swUrl, r) => {
          if (!r) return;
          this.registration = r;
          console.log('[PWA] Service Worker registered successfully.');

          if (r.waiting) {
            this.hasUpdate = true;
            this.notifyListeners();
          }

          r.addEventListener('updatefound', () => {
            const installing = r.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                this.hasUpdate = true;
                this.notifyListeners();
                void this.fetchServerVersion();
              }
            });
          });

          // Check immediately on startup so stale PWAs notice updates right away
          void this.checkForUpdate(true);
        },
        onRegisterError: (error) => {
          console.error('[PWA] Service Worker registration failed:', error);
        },
      });

      // Reload when a new Service Worker takes control after user-triggered update (or external skipWaiting)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing && (hadController || this.applyingUpdate)) {
          refreshing = true;
          window.location.reload();
        }
      });
    } else {
      void this.checkForUpdate(true);
    }

    // Check on visibility change (iOS/Android PWA app switch & unlock)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.checkForUpdate();
      }
    });

    // Check on window focus or network reconnection
    window.addEventListener('focus', () => {
      void this.checkForUpdate();
    });
    window.addEventListener('online', () => {
      void this.checkForUpdate(true);
    });

    // Periodic background check while app stays open
    setInterval(() => {
      void this.checkForUpdate();
    }, PERIODIC_CHECK_MS);
  }

  getState(): PwaUpdateState {
    return {
      hasUpdate: this.hasUpdate,
      availableVersion: this.availableVersion,
      isStandalone: detectStandaloneMode(),
    };
  }

  private async fetchServerVersion(): Promise<AppVersionInfo | null> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as Partial<AppVersionInfo> | null;
      if (!data || typeof data.version !== 'string' || typeof data.buildId !== 'string') {
        return null;
      }
      if (data.buildId !== APP_VERSION_INFO.buildId) {
        this.availableVersion = data.version;
        this.hasUpdate = true;
        this.notifyListeners();
      }
      return data as AppVersionInfo;
    } catch {
      return null;
    }
  }

  async checkForUpdate(force = false): Promise<boolean> {
    const now = Date.now();
    if (!force && this.inFlightCheck) {
      return this.inFlightCheck;
    }
    if (!force && now - this.lastCheckAt < CHECK_THROTTLE_MS) {
      return this.hasUpdate;
    }

    const run = async (): Promise<boolean> => {
      this.lastCheckAt = Date.now();

      if (!this.registration && 'serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) this.registration = reg;
        } catch {
          // ignore
        }
      }

      if (this.registration?.waiting) {
        this.hasUpdate = true;
        this.notifyListeners();
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return this.hasUpdate;
      }

      // Check both SW registration and server version.json in parallel
      const swUpdatePromise = this.registration
        ? this.registration.update().catch((e) => {
            console.warn('[PWA] Service Worker update check failed:', e);
          })
        : Promise.resolve();

      const [remoteVersion] = await Promise.all([
        this.fetchServerVersion(),
        swUpdatePromise,
      ]);

      if (this.registration?.waiting) {
        this.hasUpdate = true;
        if (remoteVersion?.version) {
          this.availableVersion = remoteVersion.version;
        }
        this.notifyListeners();
        return true;
      }

      return this.hasUpdate;
    };

    this.inFlightCheck = run().finally(() => {
      this.inFlightCheck = null;
    });

    return this.inFlightCheck;
  }

  async applyUpdate(): Promise<void> {
    this.applyingUpdate = true;

    if (!this.registration && 'serviceWorker' in navigator) {
      try {
        this.registration = (await navigator.serviceWorker.getRegistration()) ?? null;
      } catch {
        // ignore
      }
    }

    // Give SW one quick chance to settle a waiting worker if detected via version.json
    if (this.registration && !this.registration.waiting) {
      try {
        await this.registration.update();
      } catch {
        // ignore
      }
    }

    if (this.registration?.waiting) {
      // Safety reload in case controllerchange doesn't fire on some iOS WebKit versions
      const fallbackReload = setTimeout(() => {
        window.location.reload();
      }, 2500);

      try {
        if (this.updateSW) {
          await this.updateSW(true);
        }
        this.registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      } catch {
        clearTimeout(fallbackReload);
        window.location.reload();
      }
      return;
    }

    // If no waiting worker exists (e.g., server updated before SW waiting state or non-SW cache),
    // clear CacheStorage entries and reload cleanly while keeping IndexedDB/localStorage intact.
    await this.forcePurgeAndReload();
  }

  async forcePurgeAndReload(): Promise<void> {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
    window.location.reload();
  }

  subscribe(cb: UpdateCallback) {
    this.updateListeners.add(cb);
    cb(this.getState());
    return () => {
      this.updateListeners.delete(cb);
    };
  }

  private notifyListeners() {
    const state = this.getState();
    this.updateListeners.forEach((cb) => cb(state));
  }
}

export const pwaManager = new PwaManager();
