import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { API, Api, errorMessage, eventPath } from '../core/api';
import { fileSize, formatTimestamp } from '../core/format';
import { ModeService } from '../core/mode';
import { DOCUMENT_KIND_LABEL, DocumentKind, DocumentRecord, MODES } from '../core/models';
import { Toast } from '../core/ui';
import { Icon } from '../shared/icon';
import { EmptyState, Notice, Sheet } from '../shared/ui';

/** Document records. Uploading files waits for a private Supabase Storage bucket (backend/README.md). */
@Component({
  selector: 'k-documents',
  imports: [ReactiveFormsModule, Icon, EmptyState, Notice, Sheet],
  template: `
    <div class="ph">
      <div class="ph-t"><div class="eyebrow acc">{{ modeLabel() }}</div><h1>Documents</h1>
        <p class="sub">Quotations, receipts, agreements and paperwork. Only the two of you can open them.</p></div>
    </div>
    <k-notice icon="upload">Uploading files is coming next. It needs a private storage space set up in Supabase first.</k-notice>
    @if (docs.hasValue() && docs.value().length) {
      <div class="list">
        @for (d of docs.value(); track d.id) {
          <div class="row"><span class="kind-ic"><k-icon name="file-text" [size]="17" /></span>
            <button type="button" class="row-main" (click)="openEdit(d)"><span class="t">{{ d.name }}</span>
              <span class="s">{{ kindLabel[d.kind] }} · {{ size(d.size_bytes) }} · {{ stamp(d.created_at) }}</span></button></div>
        }
      </div>
    } @else if (docs.hasValue()) {
      <k-empty art="documents-stationery" title="No documents yet" text="Quotations, receipts, agreements and paperwork will be listed here, as PDF or image files up to 15 MB each." />
    } @else { <div class="empty">Loading documents…</div> }

    <k-sheet [open]="!!editing()" title="Document" (closed)="editing.set(null)">
      <button sheetAction type="submit" form="doc-form" class="r" [disabled]="busy()">Save</button>
      <form id="doc-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (error()) { <div class="sheet-err" role="alert">{{ error() }}</div> }
        <div class="list">
          <div class="field stack"><label for="d-name">Name</label><input id="d-name" formControlName="name" maxlength="200"></div>
          <div class="field"><label for="d-kind">Type</label><select id="d-kind" formControlName="kind">
            @for (k of kinds; track k) { <option [value]="k">{{ kindLabel[k] }}</option> }</select></div>
        </div>
        <div class="sheet-acts">
          <button class="btn block" type="submit" [disabled]="busy()">Save changes</button>
          <button type="button" class="btn danger block" (click)="remove()" [disabled]="busy()"><k-icon name="trash-2" [size]="18" />{{ confirmDelete() ? 'Tap again to delete' : 'Delete' }}</button>
        </div>
      </form>
    </k-sheet>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Documents {
  private readonly mode = inject(ModeService);
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);

  protected readonly kinds: DocumentKind[] = ['QUOTATION', 'RECEIPT', 'AGREEMENT', 'PAPERWORK', 'OTHER'];
  protected readonly kindLabel = DOCUMENT_KIND_LABEL;
  protected readonly size = fileSize;
  protected readonly stamp = formatTimestamp;
  protected readonly editing = signal<DocumentRecord | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly confirmDelete = signal(false);
  protected readonly docs = httpResource<DocumentRecord[]>(() => {
    const id = this.mode.eventId();
    return id ? API + eventPath(id, '/documents') : undefined;
  }, { defaultValue: [] });
  protected readonly modeLabel = computed(() => MODES[this.mode.mode()].label);
  protected readonly form = inject(NonNullableFormBuilder).group({ name: [''], kind: ['OTHER' as DocumentKind] });

  protected openEdit(d: DocumentRecord): void {
    this.form.reset({ name: d.name, kind: d.kind });
    this.error.set('');
    this.confirmDelete.set(false);
    this.editing.set(d);
  }

  protected async save(): Promise<void> {
    const d = this.editing()!;
    const v = this.form.getRawValue();
    if (!v.name.trim()) return this.error.set('Give the document a name.');
    await this.run(async () => {
      await this.api.patch(eventPath(d.planning_event_id, `/documents/${d.id}`), { version: d.version, name: v.name.trim(), kind: v.kind });
      this.toast.show('Saved');
    });
  }

  protected async remove(): Promise<void> {
    if (!this.confirmDelete()) return this.confirmDelete.set(true);
    const d = this.editing()!;
    await this.run(async () => {
      await this.api.delete(eventPath(d.planning_event_id, `/documents/${d.id}`));
      this.toast.show('Document deleted');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      this.editing.set(null);
      this.docs.reload();
    } catch (err) {
      this.error.set(errorMessage(err));
      this.confirmDelete.set(false);
    } finally {
      this.busy.set(false);
    }
  }
}
