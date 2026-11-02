import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth';
import { SessionStore } from '../core/session';
import { Emblem } from '../shared/art';
import { Icon } from '../shared/icon';
import { Notice } from '../shared/ui';

type LoginMode = 'password' | 'link' | 'reset';

@Component({
  selector: 'k-login',
  imports: [ReactiveFormsModule, Emblem, Icon, Notice],
  template: `
    <main class="auth">
      <div class="auth-card">
        <k-emblem [size]="72" />
        <div class="eyebrow">Razeen &amp; Sabrina</div>
        <h1>Welcome to kita.</h1>
        <p class="sub" style="margin-inline:auto">Our journey, thoughtfully planned.</p>

        @if (!auth.configured()) {
          <div style="margin-top:24px;text-align:left">
            <k-notice icon="lock">Sign-in isn't set up yet. Add <b>SUPABASE_URL</b> and <b>SUPABASE_ANON_KEY</b> to the backend settings.</k-notice>
          </div>
        } @else {
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            @if (error()) { <div class="sheet-err" role="alert">{{ error() }}</div> }
            @if (sent()) { <div class="auth-ok" role="status">{{ sent() }}</div> }
            <div class="list">
              <div class="field stack"><label for="email">Email</label>
                <input id="email" type="email" formControlName="email" autocomplete="email" placeholder="you@example.com"></div>
              @if (mode() === 'password') {
                <div class="field stack"><label for="password">Password</label>
                  <input id="password" type="password" formControlName="password" autocomplete="current-password"></div>
              }
            </div>
            <button class="btn block" type="submit" [disabled]="busy()">
              @switch (mode()) {
                @case ('password') { <k-icon name="key-round" [size]="18" />Sign in }
                @case ('link') { <k-icon name="mail" [size]="18" />Email me a sign-in link }
                @case ('reset') { <k-icon name="mail" [size]="18" />Email me a reset link }
              }
            </button>
          </form>
          <div class="alt">
            @if (mode() !== 'password') { <button type="button" class="link-btn" (click)="switch('password')">Sign in with password</button> }
            @if (mode() !== 'link') { <button type="button" class="link-btn" (click)="switch('link')">Email me a sign-in link instead</button> }
            @if (mode() !== 'reset') { <button type="button" class="link-btn" (click)="switch('reset')">Forgot your password?</button> }
            <span>kita. is private. Accounts are by invitation only.</span>
          </div>
        }
      </div>
    </main>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly mode = signal<LoginMode>('password');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly sent = signal('');
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: [''],
  });

  protected switch(mode: LoginMode): void {
    this.mode.set(mode);
    this.error.set('');
    this.sent.set('');
  }

  protected async submit(): Promise<void> {
    const { email, password } = this.form.getRawValue();
    if (this.form.controls.email.invalid) return this.error.set('Enter your email address.');
    if (this.mode() === 'password' && !password) return this.error.set('Enter your password.');
    this.busy.set(true);
    this.error.set('');
    this.sent.set('');
    try {
      if (this.mode() === 'password') {
        const problem = await this.auth.signInWithPassword(email.trim(), password);
        if (problem) this.error.set(problem);
        else await this.router.navigateByUrl('/');
      } else if (this.mode() === 'link') {
        const problem = await this.auth.sendSignInLink(email.trim());
        if (problem) this.error.set(problem);
        else this.sent.set('Check your email for a sign-in link.');
      } else {
        const problem = await this.auth.sendPasswordReset(email.trim());
        if (problem) this.error.set(problem);
        else this.sent.set('If that email is invited, a link to set a new password is on its way.');
      }
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'k-set-password',
  imports: [ReactiveFormsModule, RouterLink, Emblem],
  template: `
    <main class="auth">
      <div class="auth-card">
        <k-emblem [size]="72" />
        <h1>Set your password</h1>
        @if (!ready()) {
          <p class="sub" style="margin-inline:auto">One moment…</p>
        } @else if (!auth.signedIn()) {
          <p class="sub" style="margin-inline:auto">This link has expired or was already used. Ask for a new one from the sign-in page.</p>
          <div class="alt"><a class="btn" routerLink="/login">Go to sign in</a></div>
        } @else {
          <p class="sub" style="margin-inline:auto">You'll use it to sign in to kita. on any device.</p>
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            @if (error()) { <div class="sheet-err" role="alert">{{ error() }}</div> }
            <div class="list">
              <div class="field stack"><label for="pw">New password</label>
                <input id="pw" type="password" formControlName="password" autocomplete="new-password"></div>
              <div class="field stack"><label for="pw2">Repeat it</label>
                <input id="pw2" type="password" formControlName="repeat" autocomplete="new-password"></div>
            </div>
            <button class="btn block" type="submit" [disabled]="busy()">Save password</button>
          </form>
        }
      </div>
    </main>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetPassword implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly ready = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly form = inject(NonNullableFormBuilder).group({ password: [''], repeat: [''] });

  async ngOnInit(): Promise<void> {
    await this.auth.init();
    this.ready.set(true);
  }

  protected async submit(): Promise<void> {
    const { password, repeat } = this.form.getRawValue();
    if (password.length < 8) return this.error.set('Use at least 8 characters.');
    if (password !== repeat) return this.error.set("The two passwords don't match.");
    this.busy.set(true);
    const problem = await this.auth.setPassword(password);
    this.busy.set(false);
    if (problem) this.error.set(problem);
    else await this.router.navigateByUrl('/');
  }
}

@Component({
  selector: 'k-not-invited',
  imports: [Emblem, Icon],
  template: `
    <main class="auth">
      <div class="auth-card">
        <k-emblem [size]="72" />
        <h1>Almost there</h1>
        <p class="sub" style="margin-inline:auto">You're signed in as <b>{{ auth.email() }}</b>, but this account hasn't been added to a kita. workspace yet.
          Once Razeen or Sabrina links it, sign in again.</p>
        <div class="alt"><button type="button" class="btn secondary" (click)="signOut()"><k-icon name="log-out" [size]="18" />Sign out</button></div>
      </div>
    </main>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotInvited {
  protected readonly auth = inject(AuthService);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.session.reset();
    await this.router.navigateByUrl('/login');
  }
}

@Component({
  selector: 'k-unavailable',
  imports: [Emblem, Icon],
  template: `
    <main class="auth">
      <div class="auth-card">
        <k-emblem [size]="72" />
        <h1>Couldn't load kita.</h1>
        <p class="sub" style="margin-inline:auto">{{ session.loadError() || 'Something went wrong while loading your plan.' }}
          You're still signed in; nothing was lost.</p>
        <div class="alt">
          <button type="button" class="btn" (click)="retry()">Try again</button>
          <button type="button" class="link-btn" (click)="signOut()"><k-icon name="log-out" [size]="16" /> Sign out</button>
        </div>
      </div>
    </main>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Unavailable {
  protected readonly session = inject(SessionStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected async retry(): Promise<void> {
    this.session.reset();
    await this.router.navigateByUrl('/');
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.session.reset();
    await this.router.navigateByUrl('/login');
  }
}
