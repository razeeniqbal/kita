import { Injectable, computed, signal } from '@angular/core';
import { AuthError, Session, SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

const DEV_TOKEN_KEY = 'kita-dev-token';

/**
 * Supabase Auth, invite-only (spec section 2). Sign-up is off in Supabase; people arrive through an
 * invitation email, set a password, then sign in with it or with an emailed link.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private client: SupabaseClient | null = null;
  private initializing: Promise<void> | null = null;
  private readonly devToken = signal<string | null>(null);

  readonly ready = signal(false);
  /** False until the backend serves a Supabase URL and public key. */
  readonly configured = signal(true);
  readonly session = signal<Session | null>(null);
  /** Arrived from an invitation or password-reset link: ask for a new password first. */
  readonly needsPassword = signal(false);
  readonly signedIn = computed(() => !!this.devToken() || !!this.session());
  readonly email = computed(() => this.session()?.user.email ?? (this.devToken() ? 'developer@localhost' : null));

  init(): Promise<void> {
    return (this.initializing ??= this.start());
  }

  private async start(): Promise<void> {
    if (environment.devAuth) {
      const token = localStorage.getItem(DEV_TOKEN_KEY);
      if (token) {
        this.devToken.set(token);
        this.ready.set(true);
        return;
      }
    }
    if (/type=(invite|recovery)/.test(location.hash)) this.needsPassword.set(true);
    const config = await fetch('/api/v1/public-config').then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (!config?.auth_configured) {
      this.configured.set(false);
      this.ready.set(true);
      return;
    }
    this.client = createClient(config.supabase_url, config.supabase_anon_key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    });
    const { data } = await this.client.auth.getSession();
    this.session.set(data.session);
    this.client.auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      if (event === 'PASSWORD_RECOVERY') this.needsPassword.set(true);
    });
    this.ready.set(true);
  }

  async accessToken(): Promise<string | null> {
    await this.init();
    if (this.devToken()) return this.devToken();
    if (!this.client) return null;
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async signInWithPassword(email: string, password: string): Promise<string | null> {
    const { error } = await this.requireClient().auth.signInWithPassword({ email, password });
    return error ? friendly(error) : null;
  }

  async sendSignInLink(email: string): Promise<string | null> {
    const { error } = await this.requireClient().auth.signInWithOtp({
      email, options: { shouldCreateUser: false, emailRedirectTo: location.origin },
    });
    return error ? friendly(error) : null;
  }

  async sendPasswordReset(email: string): Promise<string | null> {
    const { error } = await this.requireClient().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/set-password` });
    return error ? friendly(error) : null;
  }

  async setPassword(password: string): Promise<string | null> {
    const { error } = await this.requireClient().auth.updateUser({ password });
    if (error) return friendly(error);
    this.needsPassword.set(false);
    history.replaceState(null, '', location.pathname);
    return null;
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(DEV_TOKEN_KEY);
    this.devToken.set(null);
    await this.client?.auth.signOut();
    this.session.set(null);
  }

  /** The private bucket for document files. Access is checked by storage policies against the signed-in user. */
  documentFiles() {
    return this.requireClient().storage.from('documents');
  }

  private requireClient(): SupabaseClient {
    if (!this.client) throw new Error('Sign-in is not configured');
    return this.client;
  }
}

function friendly(error: AuthError): string {
  const message = error.message.toLowerCase();
  if (message.includes('invalid login credentials')) return "That email and password don't match.";
  if (message.includes('signups not allowed') || message.includes('user not found')) return "That email hasn't been invited to kita.";
  if (message.includes('rate limit') || error.status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (message.includes('password should be')) return 'Choose a longer password (at least 8 characters).';
  if (message.includes('same as the old')) return 'Choose a password you have not used before.';
  return error.message;
}
