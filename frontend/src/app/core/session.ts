import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';
import { Assignee, Me, Mode, Payer, WorkspaceDetail } from './models';

/** Who is signed in, their workspace, and the two planning events. Loaded once after sign-in. */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(Api);
  private loading: Promise<void> | null = null;

  readonly me = signal<Me | null>(null);
  readonly workspace = signal<WorkspaceDetail | null>(null);

  readonly eventIds = computed(() => {
    const ids: Partial<Record<Mode, string>> = {};
    for (const e of this.workspace()?.planning_events ?? []) ids[e.mode] = e.id;
    return ids;
  });
  readonly myPartner = computed(() => this.me()?.membership?.partner ?? null);
  readonly names = computed<Record<Assignee | Payer, string>>(() => {
    const ws = this.workspace();
    return {
      PARTNER_1: ws?.partner_1_name || 'Razeen', PARTNER_2: ws?.partner_2_name || 'Sabrina',
      BOTH: 'Both', UNASSIGNED: 'Unassigned', OTHER: 'Family / other',
    };
  });
  readonly myName = computed(() => {
    const p = this.myPartner();
    return p ? this.names()[p] : null;
  });

  load(): Promise<void> {
    return (this.loading ??= this.fetch().catch(err => {
      this.loading = null;
      throw err;
    }));
  }

  async refreshWorkspace(): Promise<void> {
    this.workspace.set(await this.api.get<WorkspaceDetail>('/workspaces/current'));
  }

  reset(): void {
    this.loading = null;
    this.me.set(null);
    this.workspace.set(null);
  }

  private async fetch(): Promise<void> {
    const me = await this.api.get<Me>('/me');
    this.me.set(me);
    if (me.membership) await this.refreshWorkspace();
  }
}
