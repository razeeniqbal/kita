import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { API, Api, errorMessage, eventPath } from '../core/api';
import { rm, toSen } from '../core/format';
import { ModeService } from '../core/mode';
import {
  Assignee, Expense, HANTARAN_STATUS_LABEL, HantaranItem, HantaranList, HantaranStatus, MODES, Partner, STATUS_LABEL, Task,
} from '../core/models';
import { SessionStore } from '../core/session';
import { Toast } from '../core/ui';
import { Icon } from '../shared/icon';
import { EmptyState, Sheet } from '../shared/ui';

const STATUSES: HantaranStatus[] = ['PLANNED', 'BUYING', 'BOUGHT', 'DECORATED', 'READY'];

/** Hantaran: what goes on each dulang, who gives it, and links to its cost (Budget) and task (Checklist). */
@Component({
  selector: 'k-hantaran',
  imports: [ReactiveFormsModule, RouterLink, Icon, EmptyState, Sheet],
  template: `
    <div class="ph">
      <div class="ph-t"><div class="eyebrow acc">{{ modeLabel() }}</div><h1>Hantaran</h1>
        <p class="sub">What goes on each dulang, who gives it, and what it costs. Trays are usually an odd number, and the bride's side often returns two more.</p></div>
      <button type="button" class="btn" (click)="openNew()"><k-icon name="plus" [size]="18" />Add item</button>
    </div>

    @if (list.value(); as data) {
      @if (data.items.length) {
        <div class="tiles">
          <div class="tile"><span>From {{ names().PARTNER_1 }}</span><b>{{ data.summary.sides.PARTNER_1.trays }}</b> dulang</div>
          <div class="tile"><span>From {{ names().PARTNER_2 }}</span><b>{{ data.summary.sides.PARTNER_2.trays }}</b> dulang</div>
          <div class="tile"><span>Ready</span><b>{{ data.summary.ready }}</b> of {{ data.summary.items }}</div>
          <div class="tile"><span>Cost (planned)</span><b>{{ rm(data.summary.planned_sen) }}</b></div>
        </div>
        @for (g of groups(); track g.side) {
          @if (g.items.length) {
            <div class="sec-h"><span><span class="dot"></span>From {{ names()[g.side] }}'s side</span>
              <b>{{ g.trays }} dulang · {{ g.ready }}/{{ g.items.length }} ready</b></div>
            <div class="list">
              @for (h of g.items; track h.id) {
                <div class="row" style="--inset:76px">
                  <div class="datebox"><span>Dulang</span><b>{{ h.tray_number ?? '–' }}</b></div>
                  <button type="button" class="row-main" (click)="openEdit(h)"><span class="t">{{ h.name }}</span>
                    <span class="s">{{ subline(h) }}</span></button>
                  <span class="row-end">
                    @if (h.expense_id) { <span class="pill" [class.ok]="paidInFull(h)">{{ costLabel(h) }}</span> }
                    <span class="pill" [class.ok]="h.status === 'READY'" [class.acc]="h.status === 'DECORATED' || h.status === 'BOUGHT'">{{ statusLabel[h.status] }}</span>
                  </span>
                </div>
              }
            </div>
          }
        }
        <p class="formula">Costs come from the linked budget lines: change amounts and record payments in <a routerLink="../budget">Budget</a>.
          Linked tasks show their status from the <a routerLink="../checklist">Checklist</a>.</p>
      } @else {
        <k-empty art="journey-ribbons" title="No hantaran yet"
          text="List what goes on each dulang and who gives it. Link each item to its cost in the budget and its task in the checklist."
          action="Add item" (act)="openNew()" />
      }
    } @else if (list.error()) {
      <div class="empty"><b>Couldn't load hantaran</b><div><button type="button" class="btn sm" (click)="list.reload()">Try again</button></div></div>
    } @else { <div class="empty">Loading hantaran…</div> }

    <k-sheet [open]="sheetOpen()" [title]="editing() ? 'Hantaran item' : 'New hantaran item'" (closed)="sheetOpen.set(false)">
      <button sheetAction type="submit" form="hantaran-form" class="r" [disabled]="busy()">{{ editing() ? 'Save' : 'Add' }}</button>
      <form id="hantaran-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (error()) { <div class="sheet-err" role="alert">{{ error() }}</div> }
        <div class="list">
          <div class="field stack"><label for="h-name">Item</label><input id="h-name" formControlName="name" maxlength="160" placeholder="e.g. Sirih junjung, Cincin, Kain sutera"></div>
          <div class="field stack"><span class="lab">Given by</span><div class="seg" role="radiogroup" aria-label="Given by">
            @for (p of partners; track p) { <label><input type="radio" formControlName="giver" [value]="p"><span>{{ names()[p] }}'s side</span></label> }</div></div>
          <div class="field"><label for="h-tray">Dulang number</label><input id="h-tray" type="number" min="1" max="99" formControlName="tray_number" placeholder="e.g. 1"></div>
          <div class="field"><label for="h-status">Status</label><select id="h-status" formControlName="status">
            @for (s of statuses; track s) { <option [value]="s">{{ statusLabel[s] }}</option> }</select></div>
          <div class="field"><label for="h-who">Assigned to</label><select id="h-who" formControlName="assignee">
            @for (a of assignees(); track a.key) { <option [value]="a.key">{{ a.label }}</option> }</select></div>
        </div>

        <div class="sec-h"><span>Links</span></div>
        <div class="list">
          <div class="field"><label for="h-cost">Budget line</label><select id="h-cost" formControlName="expense_id">
            <option value="">None</option>@for (e of expenses.value(); track e.id) { <option [value]="e.id">{{ e.name }}</option> }</select></div>
          @if (!editing() && !form.controls.expense_id.value) {
            <div class="field"><label for="h-add">Add to budget</label><input id="h-add" type="checkbox" class="toggle" formControlName="create_expense"></div>
            @if (form.controls.create_expense.value) {
              <div class="field"><label for="h-plan">Planned (RM)</label><input id="h-plan" inputmode="decimal" formControlName="planned" placeholder="0.00"></div>
            }
          }
          <div class="field"><label for="h-task">Checklist task</label><select id="h-task" formControlName="task_id">
            <option value="">None</option>@for (t of tasks.value(); track t.id) { <option [value]="t.id">{{ t.title }}</option> }</select></div>
        </div>
        @if (editing(); as h) {
          @if (h.expense_id) { <p class="sheet-meta">{{ h.expense_name }} · {{ costLabel(h) }}</p> }
          @if (h.task_id) { <p class="sheet-meta">Task: {{ h.task_title }} · {{ taskStatus(h) }}</p> }
        }
        <div class="list"><div class="field stack"><label for="h-notes">Notes</label><textarea id="h-notes" formControlName="notes" rows="2" placeholder="Gubahan colours, where to buy, who decorates"></textarea></div></div>

        <div class="sheet-acts">
          <button class="btn block" type="submit" [disabled]="busy()">{{ editing() ? 'Save changes' : 'Add item' }}</button>
          @if (editing()) {
            <button type="button" class="btn danger block" (click)="remove()" [disabled]="busy()"><k-icon name="trash-2" [size]="18" />{{ confirmDelete() ? 'Tap again to delete' : 'Delete' }}</button>
          }
        </div>
      </form>
    </k-sheet>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Hantaran {
  private readonly mode = inject(ModeService);
  private readonly session = inject(SessionStore);
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);

  protected readonly rm = rm;
  protected readonly names = this.session.names;
  protected readonly statuses = STATUSES;
  protected readonly statusLabel = HANTARAN_STATUS_LABEL;
  protected readonly partners: Partner[] = ['PARTNER_1', 'PARTNER_2'];
  protected readonly sheetOpen = signal(false);
  protected readonly editing = signal<HantaranItem | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly confirmDelete = signal(false);

  private readonly url = (path: string) => () => {
    const id = this.mode.eventId();
    return id ? API + eventPath(id, path) : undefined;
  };
  protected readonly list = httpResource<HantaranList>(this.url('/hantaran'));
  protected readonly expenses = httpResource<Expense[]>(this.url('/expenses'), { defaultValue: [] });
  protected readonly tasks = httpResource<Task[]>(this.url('/tasks'), { defaultValue: [] });

  protected readonly modeLabel = computed(() => MODES[this.mode.mode()].label);
  protected readonly assignees = computed(() => {
    const n = this.names();
    return (['UNASSIGNED', 'PARTNER_1', 'PARTNER_2', 'BOTH'] as Assignee[]).map(key => ({ key, label: n[key] }));
  });
  protected readonly groups = computed(() => {
    const data = this.list.value();
    return this.partners.map(side => ({
      side, items: (data?.items ?? []).filter(i => i.giver === side),
      trays: data?.summary.sides[side].trays ?? 0, ready: data?.summary.sides[side].ready ?? 0,
    }));
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(160)]],
    giver: ['PARTNER_1' as Partner],
    tray_number: [null as number | null],
    status: ['PLANNED' as HantaranStatus],
    assignee: ['UNASSIGNED' as Assignee],
    expense_id: [''],
    task_id: [''],
    create_expense: [false],
    planned: [''],
    notes: [''],
  });

  protected subline(h: HantaranItem): string {
    return [this.names()[h.assignee], h.task_title ? `Task: ${this.taskStatus(h).toLowerCase()}` : '', h.notes.slice(0, 50)]
      .filter(Boolean).join(' · ');
  }
  protected taskStatus(h: HantaranItem): string {
    return h.task_status ? STATUS_LABEL[h.task_status] : '';
  }
  protected paidInFull(h: HantaranItem): boolean {
    return !!h.committed_sen && h.paid_sen >= h.committed_sen;
  }
  protected costLabel(h: HantaranItem): string {
    if (this.paidInFull(h)) return `Paid ${rm(h.paid_sen)}`;
    if (h.paid_sen) return `${rm(h.paid_sen)} paid of ${rm(h.committed_sen || h.planned_sen)}`;
    return rm(h.committed_sen || h.planned_sen);
  }

  protected openNew(): void {
    this.editing.set(null);
    this.form.reset({ name: '', giver: 'PARTNER_1', tray_number: null, status: 'PLANNED', assignee: 'UNASSIGNED',
                      expense_id: '', task_id: '', create_expense: false, planned: '', notes: '' });
    this.show();
  }

  protected openEdit(h: HantaranItem): void {
    this.editing.set(h);
    this.form.reset({ name: h.name, giver: h.giver, tray_number: h.tray_number, status: h.status, assignee: h.assignee,
                      expense_id: h.expense_id ?? '', task_id: h.task_id ?? '', create_expense: false, planned: '', notes: h.notes });
    this.show();
  }

  private show(): void {
    this.error.set('');
    this.confirmDelete.set(false);
    this.sheetOpen.set(true);
  }

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    if (!v.name.trim()) return this.error.set('Name the item, for example Sirih junjung.');
    const tray = v.tray_number === null || (v.tray_number as unknown) === '' ? null : Number(v.tray_number);
    if (tray !== null && (!Number.isInteger(tray) || tray < 1 || tray > 99)) return this.error.set('Dulang number must be from 1 to 99.');
    const planned = toSen(v.planned);
    if (planned === null) return this.error.set('Planned amount must be in RM, like 350 or 350.00.');
    const body = { name: v.name.trim(), giver: v.giver, tray_number: tray, status: v.status, assignee: v.assignee,
                   expense_id: v.expense_id || null, task_id: v.task_id || null, notes: v.notes.trim() };
    const h = this.editing();
    const eventId = this.mode.eventId()!;
    await this.run(async () => {
      if (h) await this.api.patch(eventPath(eventId, `/hantaran/${h.id}`), { ...body, version: h.version });
      else await this.api.post(eventPath(eventId, '/hantaran'),
        { ...body, create_expense: v.create_expense && !body.expense_id, planned_sen: planned });
      this.toast.show(h ? 'Saved' : v.create_expense ? 'Added, with a budget line' : 'Item added');
    });
  }

  protected async remove(): Promise<void> {
    if (!this.confirmDelete()) return this.confirmDelete.set(true);
    const h = this.editing()!;
    await this.run(async () => {
      await this.api.delete(eventPath(h.planning_event_id, `/hantaran/${h.id}`));
      this.toast.show('Item deleted. Its budget line and task are kept.');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      this.sheetOpen.set(false);
      this.list.reload();
      this.expenses.reload();
    } catch (err) {
      this.error.set(errorMessage(err));
      this.confirmDelete.set(false);
    } finally {
      this.busy.set(false);
    }
  }
}
