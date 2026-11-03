import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { AuthService } from '../core/auth';
import { MODES, Mode } from '../core/models';
import { PushPrefs, PushService } from '../core/push';
import { SessionStore } from '../core/session';
import { Theme, ThemeService, Toast } from '../core/ui';
import { EventSheet } from '../shared/event-sheet';
import { Icon, IconName } from '../shared/icon';
import { Notice, Sheet } from '../shared/ui';

@Component({
  selector: 'k-settings',
  imports: [ReactiveFormsModule, EventSheet, Icon, Notice, Sheet],
  template: `
    <div class="ph"><div class="ph-t"><div class="eyebrow">Shared</div><h1>Settings</h1></div></div>

    <div class="sec-h">Couple</div>
    <div class="list"><div class="row"><span class="avatar">{{ names().PARTNER_1.charAt(0) }}</span>
      <button type="button" class="row-main" (click)="openNames()"><span class="t">{{ names().PARTNER_1 }} &amp; {{ names().PARTNER_2 }}</span>
        <span class="s">Names shown across the app</span></button><k-icon name="chevron-right" /></div></div>

    <div class="sec-h">Milestones</div>
    <div class="list">
      @for (m of modes; track m.mode) {
        <div class="row" [class]="'row m-' + m.slug"><span class="kind-ic"><k-icon [name]="m.icon" [size]="17" /></span>
          <button type="button" class="row-main" (click)="editingMode.set(m.mode)"><span class="t">{{ m.label }}</span>
            <span class="s">Name, date, status and target budget</span></button><k-icon name="chevron-right" /></div>
      }
    </div>

    <div class="sec-h">Appearance on this device</div>
    <div class="list"><div class="row"><div class="seg" style="flex:1" role="group" aria-label="Appearance">
      @for (t of themes; track t.key) { <button type="button" [attr.aria-pressed]="theme.theme() === t.key" (click)="theme.set(t.key)">{{ t.label }}</button> }
    </div></div></div>

    <div class="sec-h">Notifications on this device</div>
    @switch (push.state()) {
      @case ('install-first') {
        <k-notice icon="share">To get notifications on iPhone, add kita. to your Home Screen: tap <b>Share</b>, then
          <b>Add to Home Screen</b>. Open kita. from there and come back to this page.</k-notice>
      }
      @case ('unsupported') { <k-notice icon="bell-off">This browser can't show notifications. Try Chrome, Edge, Firefox or Safari.</k-notice> }
      @case ('blocked') {
        <k-notice icon="bell-off">Notifications are blocked for kita. Allow them in this browser's site settings
          (or your phone's notification settings), then reload.</k-notice>
      }
      @case ('server-off') { <k-notice icon="bell-off">Notifications aren't set up on the server yet.</k-notice> }
      @case ('loading') { <div class="list"><div class="row"><div class="row-main"><span class="s">Checking…</span></div></div></div> }
      @case ('off') {
        <div class="list">
          <button type="button" class="row-btn" (click)="enable()" [disabled]="push.busy()"><k-icon name="bell" [size]="18" />Turn on notifications</button>
        </div>
        <p class="sheet-meta">Hear when {{ partnerName() }} changes something, and get a short summary each morning.</p>
      }
      @case ('on') {
        <div class="list">
          <div class="field"><label for="n-partner">When {{ partnerName() }} changes something</label>
            <input id="n-partner" type="checkbox" class="toggle" [checked]="push.prefs()?.partner_updates" (change)="setPref('partner_updates', $event)"></div>
          <div class="field"><label for="n-daily">Morning summary at 8 AM</label>
            <input id="n-daily" type="checkbox" class="toggle" [checked]="push.prefs()?.daily_digest" (change)="setPref('daily_digest', $event)"></div>
          <button type="button" class="row-btn" (click)="sendTest()" [disabled]="push.busy()"><k-icon name="send" [size]="18" />Send a test notification</button>
          <button type="button" class="row-btn" (click)="disable()" [disabled]="push.busy()"><k-icon name="bell-off" [size]="18" />Turn off on this device</button>
        </div>
      }
    }

    <div class="sec-h">Account</div>
    <div class="list">
      <div class="row"><div class="row-main"><span class="t">{{ auth.email() }}</span><span class="s">Signed in as {{ myName() }}</span></div></div>
      <button type="button" class="row-btn" (click)="signOut()"><k-icon name="log-out" [size]="18" />Sign out</button>
    </div>

    <div class="sec-h">Preferences</div>
    <div class="list">
      <div class="row"><div class="row-main"><span class="t">Currency</span></div><span class="row-end" style="color:var(--text2)">MYR (RM)</span></div>
      <div class="row"><div class="row-main"><span class="t">Time zone</span></div><span class="row-end" style="color:var(--text2)">Asia/Kuala Lumpur</span></div>
      <div class="row"><div class="row-main"><span class="t">Language</span></div><span class="row-end" style="color:var(--text2)">English</span></div>
    </div>

    <div class="sec-h">Privacy</div>
    <div class="list"><div class="row"><span class="kind-ic"><k-icon name="shield-check" [size]="17" /></span>
      <div class="row-main"><span class="t">Private to the two of you</span>
        <span class="s">Accounts are by invitation only, and every request is checked against your workspace. Nothing here is public.</span></div></div></div>

    <k-sheet [open]="namesOpen()" title="Your names" (closed)="namesOpen.set(false)">
      <button sheetAction type="submit" form="names-form" class="r" [disabled]="busy()">Save</button>
      <form id="names-form" [formGroup]="form" (ngSubmit)="saveNames()" novalidate>
        @if (error()) { <div class="sheet-err" role="alert">{{ error() }}</div> }
        <div class="list">
          <div class="field"><label for="s-p1">Partner 1</label><input id="s-p1" formControlName="partner_1_name" maxlength="60"></div>
          <div class="field"><label for="s-p2">Partner 2</label><input id="s-p2" formControlName="partner_2_name" maxlength="60"></div>
        </div>
        <div class="sheet-acts"><button class="btn block" type="submit" [disabled]="busy()">Save changes</button></div>
      </form>
    </k-sheet>
    <k-event-sheet [open]="!!editingMode()" [eventId]="editingEventId()" [mode]="editingMode() ?? 'TUNANG'" (closed)="editingMode.set(null)" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly push = inject(PushService);
  private readonly session = inject(SessionStore);
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);

  protected readonly names = this.session.names;
  protected readonly myName = computed(() => this.session.myName() ?? 'a member');
  protected readonly partnerName = computed(() =>
    this.session.myPartner() === 'PARTNER_2' ? this.names().PARTNER_1 : this.names().PARTNER_2);
  protected readonly modes: { mode: Mode; slug: string; label: string; icon: IconName }[] = [
    { mode: 'TUNANG', slug: 'tunang', label: MODES.TUNANG.label, icon: 'gem' },
    { mode: 'PERKAHWINAN', slug: 'perkahwinan', label: MODES.PERKAHWINAN.label, icon: 'heart-handshake' },
  ];
  protected readonly themes: { key: Theme; label: string }[] = [
    { key: 'system', label: 'System' }, { key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' },
  ];
  protected readonly editingMode = signal<Mode | null>(null);
  protected readonly editingEventId = computed(() => {
    const m = this.editingMode();
    return m ? this.session.eventIds()[m] ?? null : null;
  });
  protected readonly namesOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly form = inject(NonNullableFormBuilder).group({ partner_1_name: [''], partner_2_name: [''] });

  ngOnInit(): void {
    void this.push.init();
  }

  protected async enable(): Promise<void> {
    try {
      await this.push.enable();
      if (this.push.state() === 'on') this.toast.show('Notifications are on');
    } catch (e) {
      this.toast.show(e instanceof HttpErrorResponse ? errorMessage(e) : "Couldn't turn on notifications on this device");
    }
  }

  protected async disable(): Promise<void> {
    try {
      await this.push.disable();
      this.toast.show('Notifications are off on this device');
    } catch (e) {
      this.toast.show(errorMessage(e));
    }
  }

  protected async setPref(key: keyof PushPrefs, event: Event): Promise<void> {
    try {
      await this.push.setPref(key, (event.target as HTMLInputElement).checked);
    } catch (e) {
      this.toast.show(errorMessage(e));
    }
  }

  protected async sendTest(): Promise<void> {
    try {
      await this.push.test();
      this.toast.show('Sent. It should arrive in a few seconds');
    } catch (e) {
      this.toast.show(errorMessage(e));
    }
  }

  protected openNames(): void {
    const ws = this.session.workspace()!;
    this.form.reset({ partner_1_name: ws.partner_1_name, partner_2_name: ws.partner_2_name });
    this.error.set('');
    this.namesOpen.set(true);
  }

  protected async saveNames(): Promise<void> {
    const v = this.form.getRawValue();
    if (!v.partner_1_name.trim() || !v.partner_2_name.trim()) return this.error.set('Both names are needed.');
    this.busy.set(true);
    try {
      await this.api.patch('/workspaces/current', { version: this.session.workspace()!.version,
        partner_1_name: v.partner_1_name.trim(), partner_2_name: v.partner_2_name.trim() });
      await this.session.refreshWorkspace();
      this.toast.show('Saved');
      this.namesOpen.set(false);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.session.reset();
    await this.router.navigateByUrl('/login');
  }
}
