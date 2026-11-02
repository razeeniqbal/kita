import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';

export interface PushPrefs {
  partner_updates: boolean;
  daily_digest: boolean;
}

/** What this device can do about notifications, in the order Settings checks it. */
export type PushState = 'loading' | 'install-first' | 'unsupported' | 'blocked' | 'server-off' | 'off' | 'on';

/** Turns web push on and off for this device and keeps its choices in step with the server. */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly api = inject(Api);
  private started = false;

  readonly supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
    && 'Notification' in window;
  /** iPhone and iPad only allow push from the app added to the Home Screen. */
  readonly needsInstall = isIos() && !isStandalone();

  private readonly loaded = signal(false);
  private readonly serverReady = signal(false);
  readonly permission = signal<NotificationPermission>(this.supported ? Notification.permission : 'default');
  /** This device's choices, or null while notifications are off here. */
  readonly prefs = signal<PushPrefs | null>(null);
  readonly busy = signal(false);

  readonly state = computed<PushState>(() => {
    if (!this.supported) return this.needsInstall ? 'install-first' : 'unsupported';
    if (!this.loaded()) return 'loading';
    if (this.permission() === 'denied') return 'blocked';
    if (!this.serverReady()) return 'server-off';
    return this.prefs() ? 'on' : 'off';
  });

  /** Reads the server's key and this device's existing subscription. Safe to call more than once. */
  async init(): Promise<void> {
    if (!this.supported || this.started) return;
    this.started = true;
    try {
      const config = await this.api.get<{ configured: boolean }>('/push/config');
      this.serverReady.set(config.configured);
      const sub = await this.subscription();
      if (sub && config.configured && Notification.permission === 'granted') {
        this.prefs.set(await this.api.put<PushPrefs>('/push/subscription', sub.toJSON()));
      }
    } catch {
      this.started = false;
    } finally {
      this.loaded.set(true);
    }
  }

  /** Must run straight from a tap: Safari only shows the permission prompt for a user gesture. */
  async enable(): Promise<void> {
    const permission = await Notification.requestPermission();
    this.permission.set(permission);
    if (permission !== 'granted') return;
    this.busy.set(true);
    try {
      const { public_key } = await this.api.get<{ public_key: string }>('/push/config');
      const reg = await navigator.serviceWorker.ready;
      const key = base64UrlToBytes(public_key);
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub, key)) {
        await sub.unsubscribe();   // made with an older server key
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      this.prefs.set(await this.api.put<PushPrefs>('/push/subscription', sub.toJSON()));
    } finally {
      this.busy.set(false);
    }
  }

  async disable(): Promise<void> {
    this.busy.set(true);
    try {
      const sub = await this.subscription();
      if (sub) {
        await this.api.post('/push/subscription/remove', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      this.prefs.set(null);
    } finally {
      this.busy.set(false);
    }
  }

  async setPref(key: keyof PushPrefs, value: boolean): Promise<void> {
    const sub = await this.subscription();
    if (!sub) return this.prefs.set(null);
    const before = this.prefs();
    if (before) this.prefs.set({ ...before, [key]: value });
    try {
      this.prefs.set(await this.api.put<PushPrefs>('/push/subscription', { ...sub.toJSON(), [key]: value }));
    } catch (e) {
      this.prefs.set(before);
      throw e;
    }
  }

  test(): Promise<unknown> {
    return this.api.post('/push/test');
  }

  private async subscription(): Promise<PushSubscription | null> {
    const reg = await navigator.serviceWorker.getRegistration('/');
    return reg ? reg.pushManager.getSubscription() : null;
  }
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const current = sub.options.applicationServerKey;
  if (!current) return true;
  const a = new Uint8Array(current);
  return a.length === key.length && a.every((b, i) => b === key[i]);
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
