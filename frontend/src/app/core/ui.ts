import { Injectable, signal } from '@angular/core';

export type Theme = 'system' | 'light' | 'dark';

/** Appearance is a per-device choice; "system" follows the phone or computer setting. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.stored());

  constructor() {
    this.apply();
  }

  set(theme: Theme): void {
    this.theme.set(theme);
    try { localStorage.setItem('kita-theme', theme); } catch { /* not remembered */ }
    this.apply();
  }

  private apply(): void {
    const root = document.documentElement;
    const t = this.theme();
    if (t === 'system') delete root.dataset['theme'];
    else root.dataset['theme'] = t;
  }

  private stored(): Theme {
    try {
      const t = localStorage.getItem('kita-theme');
      return t === 'light' || t === 'dark' ? t : 'system';
    } catch {
      return 'system';
    }
  }
}

@Injectable({ providedIn: 'root' })
export class Toast {
  readonly message = signal('');
  readonly visible = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(message: string): void {
    this.message.set(message);
    this.visible.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.visible.set(false), 2400);
  }
}
