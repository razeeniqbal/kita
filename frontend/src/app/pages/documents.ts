import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { API, Api, errorMessage, eventPath } from '../core/api';
import { AuthService } from '../core/auth';
import { fileSize, formatTimestamp } from '../core/format';
import { ModeService } from '../core/mode';
import { DOCUMENT_KIND_LABEL, DocumentKind, DocumentRecord, MODES } from '../core/models';
import { SessionStore } from '../core/session';
import { Toast } from '../core/ui';
import { Icon } from '../shared/icon';
import { EmptyState, Sheet } from '../shared/ui';

const MAX_BYTES = 15 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
};

/** Files go straight to the private "documents" storage bucket; the API keeps their details. */
@Component({
  selector: 'k-documents',
  imports: [ReactiveFormsModule, Icon, EmptyState, Sheet],
  template: `
    <div class="ph">
      <div class="ph-t"><div class="eyebrow acc">{{ modeLabel() }}</div><h1>Documents</h1></div>
      <button type="button" class="btn" (click)="pick()" [disabled]="uploading()"><k-icon name="upload" [size]="18" />{{ uploading() ? 'Uploading…' : 'Upload' }}</button>
      <input #file type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" (change)="upload($event)">
    </div>
    @if (docs.hasValue() && docs.value().length) {
      <div class="list">
        @for (d of docs.value(); track d.id) {
          <div class="row"><span class="kind-ic"><k-icon name="file-text" [size]="17" /></span>
            <button type="button" class="row-main" (click)="openFile(d)"><span class="t">{{ d.name }}</span>
              <span class="s">{{ kindLabel[d.kind] }} · {{ size(d.size_bytes) }} · {{ stamp(d.created_at) }}</span></button>
            <button type="button" class="icon-btn" (click)="openEdit(d)" [attr.aria-label]="'Edit ' + d.name"><k-icon name="pencil" /></button></div>
        }
      </div>
    } @else if (docs.hasValue()) {
      <k-empty art="documents-stationery" title="No documents yet" text="Upload quotations, receipts and agreements. PDFs or photos, up to 15 MB."
        action="Upload" (act)="pick()" />
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
  private readonly session = inject(SessionStore);
  private readonly auth = inject(AuthService);
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('file');

  protected readonly kinds: DocumentKind[] = ['QUOTATION', 'RECEIPT', 'AGREEMENT', 'PAPERWORK', 'OTHER'];
  protected readonly kindLabel = DOCUMENT_KIND_LABEL;
  protected readonly size = fileSize;
  protected readonly stamp = formatTimestamp;
  protected readonly editing = signal<DocumentRecord | null>(null);
  protected readonly uploading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly confirmDelete = signal(false);
  protected readonly docs = httpResource<DocumentRecord[]>(() => {
    const id = this.mode.eventId();
    return id ? API + eventPath(id, '/documents') : undefined;
  }, { defaultValue: [] });
  protected readonly modeLabel = computed(() => MODES[this.mode.mode()].label);
  protected readonly form = inject(NonNullableFormBuilder).group({ name: [''], kind: ['OTHER' as DocumentKind] });

  protected pick(): void {
    this.fileInput().nativeElement.click();
  }

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const ext = TYPES[file.type];
    if (!ext) return this.toast.show('Choose a PDF or a photo (JPG, PNG, WebP or HEIC).');
    if (file.size > MAX_BYTES) return this.toast.show(`That file is ${fileSize(file.size)}. The limit is 15 MB.`);
    const eventId = this.mode.eventId();
    const workspaceId = this.session.workspace()?.id;
    if (!eventId || !workspaceId) return;

    const path = `${workspaceId}/${eventId}/${crypto.randomUUID()}.${ext}`;
    this.uploading.set(true);
    try {
      const { error } = await this.auth.documentFiles().upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);
      const name = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 200) || 'Document';
      try {
        await this.api.post(eventPath(eventId, '/documents'),
          { name, kind: guessKind(name), storage_path: path, content_type: file.type, size_bytes: file.size });
      } catch (e) {
        await this.auth.documentFiles().remove([path]);   // don't leave a file nobody can see
        throw e;
      }
      this.toast.show('Uploaded');
      this.docs.reload();
    } catch (e) {
      this.toast.show(e instanceof Error ? `Upload failed: ${e.message}` : errorMessage(e));
    } finally {
      this.uploading.set(false);
    }
  }

  protected async openFile(d: DocumentRecord): Promise<void> {
    // Open the tab during the tap, or phones block it as a pop-up; point it at the file once signed.
    const tab = window.open('', '_blank');
    const { data, error } = await this.auth.documentFiles().createSignedUrl(d.storage_path, 300);
    if (error || !data) {
      tab?.close();
      return this.toast.show("Couldn't open that file. Try again.");
    }
    if (tab) tab.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  }

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
      await this.auth.documentFiles().remove([d.storage_path]);
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

/** A first guess at the type from the file name; it can be changed afterwards. */
export function guessKind(name: string): DocumentKind {
  const n = name.toLowerCase();
  if (/resit|receipt|invois|invoice/.test(n)) return 'RECEIPT';
  if (/sebut ?harga|quot/.test(n)) return 'QUOTATION';
  if (/perjanjian|agreement|kontrak|contract/.test(n)) return 'AGREEMENT';
  return 'OTHER';
}
