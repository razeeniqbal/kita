import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { API, Api, errorMessage, eventPath } from '../core/api';
import { rm, senToInput, toSen } from '../core/format';
import { ModeService } from '../core/mode';
import { Booking, MODES, VENDOR_CATEGORIES, VENDOR_STATUS_LABEL, VendorContact, VendorStatus } from '../core/models';
import { Toast } from '../core/ui';
import { Art } from '../shared/art';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/ui';

const STATUSES: VendorStatus[] = ['CONSIDERING', 'SHORTLISTED', 'BOOKED', 'COMPLETED', 'CANCELLED'];

@Component({
  selector: 'k-vendors',
  imports: [ReactiveFormsModule, Art, Icon, Sheet],
  template: `
    <div class="ph">
      <div class="ph-t"><div class="eyebrow acc">{{ modeLabel() }}</div><h1>Vendors</h1></div>
      <button type="button" class="btn" (click)="openNew()"><k-icon name="plus" [size]="18" />Add vendor</button>
    </div>

    @if (bookings.hasValue() && bookings.value().length) {
      <div class="toolbar">
        <button type="button" class="chip" [attr.aria-pressed]="filter() === 'ALL'" (click)="filter.set('ALL')">All</button>
        @for (s of statuses; track s) { <button type="button" class="chip" [attr.aria-pressed]="filter() === s" (click)="filter.set(s)">{{ statusLabel[s] }}</button> }
      </div>
      @for (g of groups(); track g.name) {
        <div class="sec-h"><span><span class="dot"></span>{{ g.name }}</span><b>{{ g.items.length }}</b></div>
        <div class="list">
          @for (b of g.items; track b.id) {
            <div class="row">
              <button type="button" class="row-main" (click)="openEdit(b)"><span class="t">{{ b.name }}</span>
                <span class="s">{{ subline(b) }}</span></button>
              <span class="row-end"><span class="pill" [class.ok]="b.status === 'BOOKED' || b.status === 'COMPLETED'"
                [class.bad]="b.status === 'CANCELLED'" [class.acc]="b.status === 'SHORTLISTED'">{{ statusLabel[b.status] }}</span></span>
            </div>
          }
        </div>
      } @empty { <div class="empty">No vendors with this status.</div> }
    } @else if (bookings.hasValue()) {
      <div class="empty art-empty wide"><k-art name="botanical-border" sizes="(max-width: 899px) 100vw, 1000px" />
        <div><b>No vendors yet</b><p style="margin-inline:auto">Keep track of who you're considering, their quotes and who is booked.</p>
          <button type="button" class="btn sm" (click)="openNew()"><k-icon name="plus" [size]="18" />Add vendor</button></div></div>
    } @else { <div class="empty">Loading vendors…</div> }

    <k-sheet [open]="sheetOpen()" [title]="editing() ? 'Vendor' : 'New vendor'" (closed)="sheetOpen.set(false)">
      <button sheetAction type="submit" form="vendor-form" class="r" [disabled]="busy()">{{ editing() ? 'Save' : 'Add' }}</button>
      <form id="vendor-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (error()) { <div class="sheet-err" role="alert">{{ error() }}</div> }
        @if (!editing() && reusable().length) {
          <div class="list"><div class="field"><label for="v-reuse">Contact</label><select id="v-reuse" formControlName="reuse">
            <option value="">New vendor</option>
            @for (c of reusable(); track c.id) { <option [value]="c.id">{{ c.name }} (from {{ otherLabel() }})</option> }</select></div></div>
        }
        @if (!form.controls.reuse.value) {
          <div class="list">
            <div class="field stack"><label for="v-name">Name</label><input id="v-name" formControlName="name" maxlength="160" placeholder="Boutique or company name"></div>
            <div class="field"><label for="v-cat">Category</label><select id="v-cat" formControlName="category">
              @for (c of categories(); track c) { <option [value]="c">{{ c }}</option> }</select></div>
            <div class="field"><label for="v-contact">Contact</label><input id="v-contact" formControlName="contact" maxlength="200" placeholder="Phone, Instagram, email"></div>
          </div>
        }
        <div class="list">
          <div class="field"><label for="v-status">Status</label><select id="v-status" formControlName="status">
            @for (s of statuses; track s) { <option [value]="s">{{ statusLabel[s] }}</option> }</select></div>
          <div class="field"><label for="v-quote">Quotation (RM)</label><input id="v-quote" inputmode="decimal" formControlName="quote" placeholder="0.00"></div>
          <div class="field stack"><label for="v-notes">Notes for {{ modeLabel() }}</label><textarea id="v-notes" formControlName="notes" rows="2"></textarea></div>
        </div>
        <div class="sheet-acts">
          <button class="btn block" type="submit" [disabled]="busy()">{{ editing() ? 'Save changes' : 'Add vendor' }}</button>
          @if (editing()) {
            <button type="button" class="btn danger block" (click)="remove()" [disabled]="busy()"><k-icon name="trash-2" [size]="18" />{{ confirmDelete() ? 'Tap again to remove' : 'Remove from ' + modeLabel() }}</button>
          }
        </div>
      </form>
    </k-sheet>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Vendors {
  private readonly mode = inject(ModeService);
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);

  protected readonly rm = rm;
  protected readonly statuses = STATUSES;
  protected readonly statusLabel = VENDOR_STATUS_LABEL;
  protected readonly filter = signal<VendorStatus | 'ALL'>('ALL');
  protected readonly sheetOpen = signal(false);
  protected readonly editing = signal<Booking | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly confirmDelete = signal(false);

  protected readonly bookings = httpResource<Booking[]>(() => {
    const id = this.mode.eventId();
    return id ? API + eventPath(id, '/vendors') : undefined;
  }, { defaultValue: [] });
  protected readonly contacts = httpResource<VendorContact[]>(() => `${API}/vendor-contacts`, { defaultValue: [] });

  protected readonly modeLabel = computed(() => MODES[this.mode.mode()].label);
  protected readonly otherLabel = computed(() => MODES[MODES[this.mode.mode()].other].label);
  protected readonly categories = computed(() => VENDOR_CATEGORIES[this.mode.mode()]);
  protected readonly reusable = computed(() => {
    const here = new Set(this.bookings.value().map(b => b.vendor_id));
    return this.contacts.value().filter(c => !here.has(c.id));
  });
  protected readonly groups = computed(() => {
    const f = this.filter();
    const map = new Map<string, Booking[]>();
    for (const b of this.bookings.value()) if (f === 'ALL' || b.status === f) map.set(b.category, [...(map.get(b.category) ?? []), b]);
    const order = this.categories();
    return [...map.entries()]
      .sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
      .map(([name, items]) => ({ name, items: items.sort((x, y) => x.name.localeCompare(y.name)) }));
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    reuse: [''], name: [''], category: [''], contact: [''],
    status: ['CONSIDERING' as VendorStatus], quote: [''], notes: [''],
  });

  protected subline(b: Booking): string {
    return [b.contact, b.quote_sen ? `Quote ${rm(b.quote_sen)}` : ''].filter(Boolean).join(' · ') || 'No contact yet';
  }

  protected openNew(): void {
    this.editing.set(null);
    this.form.reset({ reuse: '', name: '', category: this.categories()[0], contact: '', status: 'CONSIDERING', quote: '', notes: '' });
    this.show();
  }

  protected openEdit(b: Booking): void {
    this.editing.set(b);
    this.form.reset({ reuse: '', name: b.name, category: b.category, contact: b.contact, status: b.status,
                      quote: senToInput(b.quote_sen), notes: b.notes });
    this.show();
  }

  private show(): void {
    this.error.set('');
    this.confirmDelete.set(false);
    this.sheetOpen.set(true);
  }

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    const quote = toSen(v.quote);
    if (quote === null) return this.error.set('Quotation must be an amount in RM.');
    if (!v.reuse && !v.name.trim()) return this.error.set('Give the vendor a name.');
    const b = this.editing();
    const eventId = this.mode.eventId()!;
    await this.run(async () => {
      if (b) {
        const contactChanged = v.name.trim() !== b.name || v.category !== b.category || v.contact.trim() !== b.contact;
        if (contactChanged) {
          await this.api.patch(`/vendor-contacts/${b.vendor_id}`, { version: b.vendor_version, name: v.name.trim(), category: v.category, contact: v.contact.trim() });
        }
        await this.api.patch(eventPath(eventId, `/vendors/${b.id}`), { version: b.version, status: v.status, quote_sen: quote, notes: v.notes.trim() });
      } else {
        await this.api.post(eventPath(eventId, '/vendors'), v.reuse
          ? { vendor_id: v.reuse, status: v.status, quote_sen: quote, notes: v.notes.trim() }
          : { name: v.name.trim(), category: v.category, contact: v.contact.trim(), status: v.status, quote_sen: quote, notes: v.notes.trim() });
      }
      this.toast.show(b ? 'Saved' : 'Vendor added');
      this.sheetOpen.set(false);
    });
  }

  protected async remove(): Promise<void> {
    if (!this.confirmDelete()) return this.confirmDelete.set(true);
    const b = this.editing()!;
    await this.run(async () => {
      await this.api.delete(eventPath(b.planning_event_id, `/vendors/${b.id}`));
      this.toast.show('Vendor removed');
      this.sheetOpen.set(false);
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
    } catch (err) {
      this.error.set(errorMessage(err));
      this.confirmDelete.set(false);
    } finally {
      this.busy.set(false);
      this.bookings.reload();
      this.contacts.reload();
    }
  }
}
