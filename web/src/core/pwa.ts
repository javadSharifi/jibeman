import { APP_VERSION_INFO, type AppChangelog, type AppVersionInfo } from './version';

export interface PwaUpdateState {
  hasUpdate: boolean;
  availableVersion: string | null;
  availableChangelog: AppChangelog | null;
  isStandalone: boolean;
  canInstallPrompt: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaApplyResult {
  ok: boolean;
  reason?: 'offline' | 'error';
}

type UpdateCallback = (state: PwaUpdateState) => void;

const CHECK_THROTTLE_MS = 10_000;
const PERIODIC_CHECK_MS = 15 * 60 * 1000;
const CACHE_BUST_PARAM = '_sw_upd';

function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: fullscreen)').matches === true ||
    nav.standalone === true
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

function stripCacheBustParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(CACHE_BUST_PARAM)) return;
    url.searchParams.delete(CACHE_BUST_PARAM);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    // ignore
  }
}

function normalizeChangelog(raw: unknown): AppChangelog | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const clean = (val: unknown): string[] =>
    Array.isArray(val)
      ? val.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean)
      : [];

  const added = clean(obj.added);
  const fixed = clean(obj.fixed);
  const improved = clean(obj.improved);
  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : undefined;

  if (added.length === 0 && fixed.length === 0 && improved.length === 0) {
    return null;
  }

  return {
    ...(title ? { title } : {}),
    ...(added.length > 0 ? { added } : {}),
    ...(fixed.length > 0 ? { fixed } : {}),
    ...(improved.length > 0 ? { improved } : {}),
  };
}

class PwaManager {
  private updateListeners: Set<UpdateCallback> = new Set();
  private registration: ServiceWorkerRegistration | null = null;
  private deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
  private initialized = false;
  private applyingUpdate = false;
  private reloading = false;
  private inFlightCheck: Promise<boolean> | null = null;
  private inFlightApply: Promise<PwaApplyResult> | null = null;
  private lastCheckAt = 0;

  public hasUpdate = false;
  public availableVersion: string | null = null;
  public availableChangelog: AppChangelog | null = null;

  init() {
    if (typeof window === 'undefined' || this.initialized) return;
    this.initialized = true;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e as BeforeInstallPromptEvent;
      this.notifyListeners();
    });

    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      this.notifyListeners();
    });

    window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change', () => {
      this.notifyListeners();
    });

    stripCacheBustParam();

    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      const hadController = Boolean(navigator.serviceWorker.controller);

      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => {
          this.registration = reg;
          this.observeRegistration(reg);
          void this.checkForUpdate(true);
        })
        .catch((error) => {
          console.error('[PWA] Service Worker registration failed:', error);
          void this.checkForUpdate(true);
        });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // If applyUpdate() is orchestrating activation, it handles the single reload cleanly.
        if (this.applyingUpdate) return;
        if (hadController) {
          this.reloadOnce(true);
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

  private observeRegistration(reg: ServiceWorkerRegistration) {
    const watchInstalling = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          this.hasUpdate = true;
          this.notifyListeners();
          void this.fetchServerVersion();
        }
      });
    };

    if (reg.waiting && navigator.serviceWorker.controller) {
      this.hasUpdate = true;
      this.notifyListeners();
    }

    if (reg.installing) {
      watchInstalling(reg.installing);
    }

    reg.addEventListener('updatefound', () => {
      watchInstalling(reg.installing);
    });
  }

  private reloadOnce(bustCache = true) {
    if (this.reloading) return;
    this.reloading = true;

    if (bustCache) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set(CACHE_BUST_PARAM, String(Date.now()));
        window.location.replace(url.toString());
        return;
      } catch {
        // fallback to standard reload below
      }
    }
    window.location.reload();
  }

  getState(): PwaUpdateState {
    return {
      hasUpdate: this.hasUpdate,
      availableVersion: this.availableVersion,
      availableChangelog: this.availableChangelog,
      isStandalone: detectStandaloneMode(),
      canInstallPrompt: this.deferredInstallPrompt !== null,
    };
  }

  async promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const promptEvent = this.deferredInstallPrompt;
    if (!promptEvent) return 'unavailable';
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        this.deferredInstallPrompt = null;
      }
      this.notifyListeners();
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
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
        this.availableChangelog = normalizeChangelog(data.changelog);
        this.hasUpdate = true;
        this.notifyListeners();
      } else if (this.hasUpdate && !this.availableChangelog && data.changelog) {
        this.availableChangelog = normalizeChangelog(data.changelog);
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
        this.registration = (await withTimeout(navigator.serviceWorker.getRegistration(), 2000)) ?? null;
        if (this.registration) this.observeRegistration(this.registration);
      }

      if (this.registration?.waiting && navigator.serviceWorker.controller) {
        this.hasUpdate = true;
        this.notifyListeners();
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return this.hasUpdate;
      }

      // Check both SW registration and server version.json in parallel
      const swUpdatePromise = this.registration
        ? withTimeout(
            this.registration.update().catch((e) => {
              console.warn('[PWA] Service Worker update check failed:', e);
            }),
            5000
          )
        : Promise.resolve(null);

      const [remoteVersion] = await Promise.all([
        this.fetchServerVersion(),
        swUpdatePromise,
      ]);

      if (this.registration?.waiting) {
        this.hasUpdate = true;
        if (remoteVersion?.version) {
          this.availableVersion = remoteVersion.version;
        }
        if (remoteVersion?.changelog) {
          this.availableChangelog = normalizeChangelog(remoteVersion.changelog);
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

  private waitForInstalling(reg: ServiceWorkerRegistration, timeoutMs: number): Promise<void> {
    const worker = reg.installing;
    if (!worker || worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.removeEventListener('statechange', onState);
        resolve();
      };
      const onState = () => {
        if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') {
          done();
        }
      };
      const timer = setTimeout(done, timeoutMs);
      worker.addEventListener('statechange', onState);
    });
  }

  private waitForActivation(waiting: ServiceWorker, timeoutMs: number): Promise<boolean> {
    if (waiting.state === 'activated') return Promise.resolve(true);
    if (waiting.state === 'redundant') return Promise.resolve(false);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        waiting.removeEventListener('statechange', onState);
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        resolve(ok);
      };
      const onState = () => {
        if (waiting.state === 'activated') finish(true);
        else if (waiting.state === 'redundant') finish(false);
      };
      const onControllerChange = () => finish(true);
      const timer = setTimeout(() => finish(false), timeoutMs);

      waiting.addEventListener('statechange', onState);
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

      try {
        waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch {
        finish(false);
      }
    });
  }

  async applyUpdate(): Promise<PwaApplyResult> {
    if (this.inFlightApply) return this.inFlightApply;

    const run = async (): Promise<PwaApplyResult> => {
      this.applyingUpdate = true;
      try {
        if (!this.registration && 'serviceWorker' in navigator) {
          this.registration = (await withTimeout(navigator.serviceWorker.getRegistration(), 2000)) ?? null;
        }

        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

        // If no waiting worker yet, ensure SW update check runs and wait for an in-progress install
        if (this.registration && !this.registration.waiting) {
          if (!this.registration.installing && !isOffline) {
            await withTimeout(this.registration.update(), 4000);
          }
          if (this.registration.installing) {
            await this.waitForInstalling(this.registration, 12_000);
          }
        }

        const waiting = this.registration?.waiting;
        if (waiting) {
          const activated = await this.waitForActivation(waiting, 4500);
          if (activated) {
            this.reloadOnce(true);
            return { ok: true };
          }
          // Stuck waiting worker (e.g. iOS WebKit client lock) -> clear & force clean navigation if online
          if (isOffline) {
            this.applyingUpdate = false;
            return { ok: false, reason: 'offline' };
          }
          await this.forcePurgeAndReload(true);
          return { ok: true };
        }

        if (isOffline) {
          this.applyingUpdate = false;
          return { ok: false, reason: 'offline' };
        }

        // Server version.json changed before SW entered waiting state: clear CacheStorage and force fresh load
        await this.forcePurgeAndReload(false);
        return { ok: true };
      } catch {
        this.applyingUpdate = false;
        return { ok: false, reason: 'error' };
      }
    };

    this.inFlightApply = run().finally(() => {
      this.inFlightApply = null;
    });

    return this.inFlightApply;
  }

  async forcePurgeAndReload(unregisterStuck = false): Promise<void> {
    if ('caches' in window) {
      await withTimeout(
        caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
        2500
      );
    }
    if (unregisterStuck && 'serviceWorker' in navigator) {
      await withTimeout(
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => Promise.all(registrations.map((r) => r.unregister()))),
        2500
      );
    }
    this.reloadOnce(true);
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
