import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ModeService } from '../core/mode';
import { MODES, ModeSlug } from '../core/models';
import { SessionStore } from '../core/session';
import { Emblem } from '../shared/art';
import { Icon, IconName } from '../shared/icon';

interface NavItem { page: string; label: string; short: string; icon: IconName; }

const PAGES: NavItem[] = [
  { page: '', label: 'Overview', short: 'Overview', icon: 'house' },
  { page: 'checklist', label: 'Checklist', short: 'Checklist', icon: 'list-checks' },
  { page: 'budget', label: 'Budget', short: 'Budget', icon: 'wallet' },
  { page: 'calendar', label: 'Calendar', short: 'Calendar', icon: 'calendar-days' },
  { page: 'guests', label: 'Guests', short: 'Guests', icon: 'users' },
  { page: 'vendors', label: 'Vendors', short: 'Vendors', icon: 'store' },
  { page: 'documents', label: 'Documents', short: 'Documents', icon: 'folder-lock' },
  { page: 'notes', label: 'Notes', short: 'Notes', icon: 'notebook-pen' },
];

@Component({
  selector: 'k-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet, Icon, Emblem],
  template: `
    <header class="top">
      <div class="top-in">
        <a class="brand" routerLink="/" aria-label="kita. home">
          <k-emblem [size]="28" /><span class="word">kita<span>.</span></span>
          <span class="couple">{{ names().PARTNER_1 }} &amp; {{ names().PARTNER_2 }}</span>
        </a>
        <ng-container [ngTemplateOutlet]="modeSwitch" />
        <div class="top-act">
          <a class="icon-btn" routerLink="/activity" aria-label="Activity"><k-icon name="bell" /></a>
          <a class="avatar" routerLink="/settings" aria-label="Settings">{{ initial() }}</a>
        </div>
      </div>
      <div class="top-mob"><ng-container [ngTemplateOutlet]="modeSwitch" /></div>
    </header>

    <ng-template #modeSwitch>
      <nav class="seg modesw" aria-label="Planning mode">
        @for (m of modeLinks; track m.slug) {
          <a [routerLink]="mode.link(m.slug)" [class.on]="mode.slug() === m.slug"
             [attr.aria-current]="mode.routeSlug() === m.slug ? 'true' : null">{{ m.label }}</a>
        }
      </nav>
    </ng-template>

    <div class="shell">
      <aside class="side" aria-label="Navigation">
        <a class="nav-i" routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }"><k-icon name="heart" [size]="19" /><span>Our journey</span></a>
        <div class="side-h">{{ modeLabel() }}</div>
        @for (p of pages; track p.page) {
          <a class="nav-i" [routerLink]="pageLink(p)" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">
            <k-icon [name]="p.icon" [size]="19" /><span>{{ p.label }}</span></a>
        }
        <div class="nav-sep"></div>
        <a class="nav-i" routerLink="/activity" routerLinkActive="on"><k-icon name="activity" [size]="19" /><span>Activity</span></a>
        <a class="nav-i" routerLink="/settings" routerLinkActive="on"><k-icon name="settings" [size]="19" /><span>Settings</span></a>
      </aside>
      <main class="main" id="main"><router-outlet /></main>
    </div>

    <div class="bottom">
      <nav aria-label="Sections">
        @for (p of pages.slice(0, 4); track p.page) {
          <a [routerLink]="pageLink(p)" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">
            <k-icon [name]="p.icon" [size]="24" /><span>{{ p.short }}</span></a>
        }
        <button type="button" [class.on]="moreActive()" (click)="menuOpen.set(true)"><k-icon name="ellipsis" [size]="24" /><span>More</span></button>
      </nav>
    </div>

    <div class="scrim" [class.open]="menuOpen()" (click)="menuOpen.set(false)"></div>
    <div class="sheet" [class.open]="menuOpen()" role="dialog" aria-modal="true" aria-label="More" [attr.inert]="menuOpen() ? null : ''">
      <div class="sheet-bar"><span></span><h2>{{ modeLabel() }}</h2>
        <button type="button" class="r" (click)="menuOpen.set(false)">Done</button></div>
      <div class="list menu">
        <a class="nav-i" routerLink="/"><k-icon name="heart" /><span>Our journey</span></a>
        @for (p of pages.slice(4); track p.page) {
          <a class="nav-i" [routerLink]="pageLink(p)"><k-icon [name]="p.icon" /><span>{{ p.label }}</span></a>
        }
        <a class="nav-i" routerLink="/activity"><k-icon name="activity" /><span>Activity</span></a>
        <a class="nav-i" routerLink="/settings"><k-icon name="settings" /><span>Settings</span></a>
      </div>
    </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly mode = inject(ModeService);
  private readonly session = inject(SessionStore);
  protected readonly pages = PAGES;
  protected readonly modeLinks: { slug: ModeSlug; label: string }[] = [
    { slug: 'tunang', label: MODES.TUNANG.label }, { slug: 'perkahwinan', label: MODES.PERKAHWINAN.label },
  ];
  protected readonly menuOpen = signal(false);
  protected readonly names = this.session.names;
  protected readonly modeLabel = computed(() => MODES[this.mode.mode()].label);
  protected readonly initial = computed(() => (this.session.myName() ?? '?').charAt(0).toUpperCase());
  protected readonly moreActive = computed(() =>
    ['guests', 'vendors', 'documents', 'notes'].includes(this.mode.page()) || (!this.mode.routeSlug() && !this.mode.onHome()));

  protected pageLink(p: NavItem): string[] {
    return p.page ? ['/', this.mode.slug(), p.page] : ['/', this.mode.slug()];
  }

  constructor() {
    inject(Router).events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      this.menuOpen.set(false);
      window.scrollTo(0, 0);
    });
  }
}
