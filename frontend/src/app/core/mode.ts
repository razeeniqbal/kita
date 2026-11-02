import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { MODE_OF, Mode, ModeSlug } from './models';
import { SessionStore } from './session';

const PAGES = ['', 'checklist', 'budget', 'hantaran', 'calendar', 'guests', 'vendors', 'documents', 'notes'] as const;
export type ModePage = (typeof PAGES)[number];

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode: not remembered */ }
}

/**
 * The active mode comes from the URL (/tunang/..., /perkahwinan/...). Each mode remembers its own
 * last page (spec section 3), and the mode's accent colour is applied to the page.
 */
@Injectable({ providedIn: 'root' })
export class ModeService {
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private readonly url = toSignal(
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(e => (e as NavigationEnd).urlAfterRedirects)),
    { initialValue: this.router.url },
  );
  private readonly segments = computed(() => this.url().split(/[?#]/)[0].split('/').filter(Boolean));
  private readonly lastSlug = signal<ModeSlug>(read('kita-mode') === 'perkahwinan' ? 'perkahwinan' : 'tunang');

  /** Mode in the URL, or null on shared pages (landing, settings, activity). */
  readonly routeSlug = computed<ModeSlug | null>(() => {
    const s = this.segments()[0];
    return s === 'tunang' || s === 'perkahwinan' ? s : null;
  });
  readonly slug = computed<ModeSlug>(() => this.routeSlug() ?? this.lastSlug());
  readonly mode = computed<Mode>(() => MODE_OF[this.slug()]);
  readonly page = computed<string>(() => (this.routeSlug() ? this.segments()[1] ?? '' : ''));
  readonly onHome = computed(() => this.segments().length === 0);
  readonly eventId = computed(() => this.session.eventIds()[this.mode()] ?? null);

  constructor() {
    effect(() => {
      const slug = this.routeSlug();
      if (!slug) return;
      this.lastSlug.set(slug);
      write('kita-mode', slug);
      write(`kita-page-${slug}`, this.page());
    });
    effect(() => {
      document.body.className = `m-${this.slug()}` + (this.onHome() ? ' on-home' : '');
    });
  }

  /** Where the mode switch should go: that mode's last visited page. */
  link(slug: ModeSlug): string {
    const page = read(`kita-page-${slug}`) ?? '';
    return `/${slug}` + ((PAGES as readonly string[]).includes(page) && page ? `/${page}` : '');
  }
}
