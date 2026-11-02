import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { API, Api, errorMessage, eventPath } from '../core/api';
import { formatTimestamp } from '../core/format';
import { ModeService } from '../core/mode';
import { MODES, Note } from '../core/models';
import { SessionStore } from '../core/session';
import { Toast } from '../core/ui';
import { Icon } from '../shared/icon';
import { actorName } from '../shared/rows';
import { EmptyState, Sheet } from '../shared/ui';

@Component({
  selector: 'k-notes',
  imports: [ReactiveFormsModule, Icon, EmptyState, Sheet],
  template: `
    <div class="ph">
      <div class="ph-t"><div class="eyebrow acc">{{ modeLabel() }}</div><h1>Notes &amp; inspiration</h1></div>
      <button type="button" class="btn" (click)="openNew()"><k-icon name="plus" [size]="18" />Add note</button>
    </div>
    @if (notes.hasValue() && notes.value().length) {
      <div class="notes">
        @for (n of sorted(); track n.id) {
          <article class="note">
            <button type="button" class="row-main" style="padding:0" (click)="openEdit(n)">
              <h3>@if (n.pinned) { <k-icon name="pin" [size]="15" /> }{{ n.title }}</h3>
            </button>
            @if (n.body) { <p>{{ n.body }}</p> }
            @if (safeLink(n.link); as href) {
              <a [href]="href" target="_blank" rel="noopener noreferrer"><k-icon name="link" [size]="14" />{{ n.link.replace('https://', '').replace('http://', '').slice(0, 48) }}</a>
            }
            <footer>{{ actor(n.updated_by) }} · {{ stamp(n.updated_at) }}</footer>
          </article>
        }
      </div>
    } @else if (notes.hasValue()) {
      <k-empty art="notes-cards" title="No notes yet" text="Pin decisions you've made together, and save inspiration links." action="Add note" (act)="openNew()" />
    } @else { <div class="empty">Loading notes…</div> }

    <k-sheet [open]="sheetOpen()" [title]="editing() ? 'Note' : 'New note'" (closed)="sheetOpen.set(false)">
      <button sheetAction type="submit" form="note-form" class="r" [disabled]="busy()">{{ editing() ? 'Save' : 'Add' }}</button>
      <form id="note-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (error()) { <div class="sheet-err" role="alert">{{ error() }}</div> }
        <div class="list">
          <div class="field stack"><label for="n-title">Title</label><input id="n-title" formControlName="title" maxlength="200" placeholder="e.g. Theme: sage &amp; ivory"></div>
          <div class="field stack"><label for="n-body">Note</label><textarea id="n-body" formControlName="body" rows="5"></textarea></div>
        </div>
        <div class="list">
          <div class="field"><label for="n-link">Link</label><input id="n-link" type="url" formControlName="link" maxlength="200" placeholder="https://"></div>
          <div class="field"><label for="n-pin">Pin to top</label><input id="n-pin" type="checkbox" class="toggle" formControlName="pinned"></div>
        </div>
        <div class="sheet-acts">
          <button class="btn block" type="submit" [disabled]="busy()">{{ editing() ? 'Save changes' : 'Add note' }}</button>
          @if (editing()) {
            <button type="button" class="btn danger block" (click)="remove()" [disabled]="busy()"><k-icon name="trash-2" [size]="18" />{{ confirmDelete() ? 'Tap again to delete' : 'Delete' }}</button>
          }
        </div>
      </form>
    </k-sheet>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Notes {
  private readonly mode = inject(ModeService);
  private readonly session = inject(SessionStore);
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);

  protected readonly sheetOpen = signal(false);
  protected readonly editing = signal<Note | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly confirmDelete = signal(false);
  protected readonly notes = httpResource<Note[]>(() => {
    const id = this.mode.eventId();
    return id ? API + eventPath(id, '/notes') : undefined;
  }, { defaultValue: [] });
  protected readonly modeLabel = computed(() => MODES[this.mode.mode()].label);
  protected readonly sorted = computed(() => [...this.notes.value()].sort((a, b) =>
    Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at)));
  protected readonly form = inject(NonNullableFormBuilder).group({ title: [''], body: [''], link: [''], pinned: [false] });
  protected readonly stamp = formatTimestamp;

  protected actor(userId: string | null | undefined): string {
    return actorName(this.session, userId ?? null);
  }

  /** Only http(s) links are made clickable. */
  protected safeLink(link: string): string | null {
    if (!link) return null;
    const href = /^https?:\/\//i.test(link) ? link : `https://${link}`;
    try {
      const u = new URL(href);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
    } catch {
      return null;
    }
  }

  protected openNew(): void {
    this.editing.set(null);
    this.form.reset({ title: '', body: '', link: '', pinned: false });
    this.show();
  }

  protected openEdit(n: Note): void {
    this.editing.set(n);
    this.form.reset({ title: n.title, body: n.body, link: n.link, pinned: n.pinned });
    this.show();
  }

  private show(): void {
    this.error.set('');
    this.confirmDelete.set(false);
    this.sheetOpen.set(true);
  }

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    if (!v.title.trim()) return this.error.set('Give the note a title.');
    const body = { title: v.title.trim(), body: v.body.trim(), link: v.link.trim(), pinned: v.pinned };
    const n = this.editing();
    const eventId = this.mode.eventId()!;
    await this.run(async () => {
      if (n) await this.api.patch(eventPath(eventId, `/notes/${n.id}`), { ...body, version: n.version });
      else await this.api.post(eventPath(eventId, '/notes'), body);
      this.toast.show(n ? 'Saved' : 'Note added');
    });
  }

  protected async remove(): Promise<void> {
    if (!this.confirmDelete()) return this.confirmDelete.set(true);
    const n = this.editing()!;
    await this.run(async () => {
      await this.api.delete(eventPath(n.planning_event_id, `/notes/${n.id}`));
      this.toast.show('Note deleted');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      this.sheetOpen.set(false);
      this.notes.reload();
    } catch (err) {
      this.error.set(errorMessage(err));
      this.confirmDelete.set(false);
    } finally {
      this.busy.set(false);
    }
  }
}
