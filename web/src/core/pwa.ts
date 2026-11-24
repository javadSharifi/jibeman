import { registerSW } from 'virtual:pwa-register';

type UpdateCallback = (hasUpdate: boolean) => void;

class PwaManager {
  private updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
  private updateListeners: Set<UpdateCallback> = new Set();
  private registration: ServiceWorkerRegistration | null = null;
  public hasUpdate = false;

  init() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    this.updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        console.log('[PWA] New version detected and ready to install.');
        this.hasUpdate = true;
        this.notifyListeners();
      },
      onOfflineReady: () => {
        console.log('[PWA] App is ready for offline use.');
      },
      onRegistered: (r) => {
        if (!r) return;
        this.registration = r;
        console.log('[PWA] Service Worker registered successfully.');

        // 1. Check for update on visibility change (iOS app switch / unlock)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            this.checkForUpdate();
          }
        });

        // 2. Check for update on window focus
        window.addEventListener('focus', () => {
          this.checkForUpdate();
        });

        // 3. Periodic update check (every 15 minutes)
        setInterval(() => {
          this.checkForUpdate();
        }, 15 * 60 * 1000);
      },
      onRegisterError: (error) => {
        console.error('[PWA] Service Worker registration failed:', error);
      }
    });

    // Handle controller change (seamless reload when new worker takes control)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }

  async checkForUpdate(): Promise<boolean> {
    if (!this.registration) {
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) this.registration = reg;
        } catch (_) {}
      }
    }

    if (this.registration) {
      try {
        await this.registration.update();
        if (this.registration.waiting) {
          this.hasUpdate = true;
          this.notifyListeners();
          return true;
        }
      } catch (e) {
        console.warn('[PWA] Update check failed:', e);
      }
    }
    return this.hasUpdate;
  }

  async applyUpdate(): Promise<void> {
    if (this.updateSW) {
      await this.updateSW(true);
    } else {
      window.location.reload();
    }
  }

  async forcePurgeAndReload(): Promise<void> {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(r => r.unregister()));
    }
    window.location.reload();
  }

  subscribe(cb: UpdateCallback) {
    this.updateListeners.add(cb);
    cb(this.hasUpdate);
    return () => {
      this.updateListeners.delete(cb);
    };
  }

  private notifyListeners() {
    this.updateListeners.forEach(cb => cb(this.hasUpdate));
  }
}

export const pwaManager = new PwaManager();
