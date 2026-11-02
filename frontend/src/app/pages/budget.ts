import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { API, Api, errorMessage, eventPath } from '../core/api';
import { dueLabel, formatDate, rm, senToInput, toSen, todayKL } from '../core/format';
import { ModeService } from '../core/mode';
import { BudgetSummary, Category, Expense, MODES, Payer } from '../core/models';
import { SessionStore } from '../core/session';
import { Toast } from '../core/ui';
import { BudgetCard } from '../shared/budget-card';
import { EventSheet } from '../shared/event-sheet';
import { Icon } from '../shared/icon';
import { EmptyState, Sheet } from '../shared/ui';

@Component({
  selector: 'k-budget',
  imports: [ReactiveFormsModule, BudgetCard, EventSheet, Icon, EmptyState, Sheet],
  template: `
    <div class="ph">
      <div class="ph-t"><div class="eyebrow acc">{{ modeLabel() }}</div><h1>Budget</h1></div>
      <button type="button" class="btn" (click)="openNew()"><k-icon name="plus" [size]="18" />Add cost</button>
    </div>

    @if (summary.value(); as s) {
      <section class="card" style="margin-bottom:8px">
        <div class="card-h"><h2>{{ s.target_sen ? 'Budget ' + rm(s.target_sen) : 'Total' }}</h2>
          <button type="button" class="link-btn" (click)="editingEvent.set(true)">{{ s.target_sen ? 'Change budget' : 'Set a budget' }}</button></div>
        <k-budget-card [summary]="s" />
      </section>
    }

    @if (expenses.hasValue() && expenses.value().length) {
      @for (g of groups(); track g.name) {
        <div class="sec-h"><span><span class="dot"></span>{{ g.name }}</span><b>{{ rm(g.total) }}</b></div>
        <div class="list">
          @for (e of g.items; track e.id) {
            <div class="row">
              <button type="button" class="row-main" (click)="openEdit(e)"><span class="t">{{ e.name }}</span>
                <span class="s" [class.ok-text]="isPaid(e)">{{ paidLine(e) }}</span></button>
              <span class="row-end">
                @if (!isPaid(e) && due(e); as d) { <span class="pill" [class.warn]="d.tone === 'warn'" [class.bad]="d.tone === 'bad'">{{ d.text }}</span> }
                <b class="amt">{{ rm(cost(e)) }}</b>
              </span>
            </div>
          }
        </div>
      }
    } @else if (expenses.hasValue()) {
      <div style="height:16px"></div>
      <k-empty art="budget-jar" title="No costs yet" text="Add each cost, like the ring or the caterer." action="Add cost" (act)="openNew()" />
    } @else { <div class="empty">Loading budget…</div> }

    <k-sheet [open]="sheetOpen()" [title]="editing() ? 'Cost' : 'New cost'" (closed)="close()">
      <button sheetAction type="submit" form="expense-form" class="r" [disabled]="busy()">{{ editing() ? 'Save' : 'Add' }}</button>
      <form id="expense-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (error()) { <div class="sheet-err" role="alert">{{ error() }}</div> }
        <div class="list">
          <div class="field stack"><label for="x-name">What for</label><input id="x-name" formControlName="name" maxlength="160" placeholder="e.g. Engagement ring"></div>
          <div class="field"><label for="x-cost">Cost (RM)</label><input id="x-cost" inputmode="decimal" formControlName="cost" placeholder="0.00"></div>
          <div class="field"><label for="x-cat">Category</label><select id="x-cat" formControlName="category_id">
            <option value="">None</option>@for (c of categories.value(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select></div>
          <div class="field"><label for="x-due">Pay by</label><input id="x-due" type="date" formControlName="balance_due_date"></div>
        </div>
        <div class="list">
          <div class="field stack"><label for="x-notes">Notes</label><textarea id="x-notes" formControlName="notes" rows="2" placeholder="Optional"></textarea></div>
        </div>
      </form>

      @if (editing(); as e) {
        <div class="sec-h"><span>Payments</span><b>{{ paidLine(e) }}</b></div>
        <div class="list">
          @for (p of e.payments; track p.id) {
            <div class="row"><div class="row-main"><span class="t amt">{{ rm(p.amount_sen) }}</span>
              <span class="s">{{ date(p.paid_on) }} · {{ names()[p.paid_by] }}{{ p.reference ? ' · ' + p.reference : '' }}</span></div>
              <button type="button" class="icon-btn" (click)="removePayment(p.id)" [attr.aria-label]="'Remove payment of ' + rm(p.amount_sen)"><k-icon name="x" /></button></div>
          } @empty {
            <div class="row"><span class="s" style="color:var(--text2)">Nothing paid yet.</span></div>
          }
          <form [formGroup]="payment" (ngSubmit)="addPayment()" novalidate>
            <div class="field"><label for="p-amt">Amount (RM)</label><input id="p-amt" inputmode="decimal" formControlName="amount" placeholder="0.00"></div>
            <div class="field"><label for="p-date">Date paid</label><input id="p-date" type="date" formControlName="paid_on"></div>
            <div class="field"><label for="p-by">Paid by</label><select id="p-by" formControlName="paid_by">
              @for (o of payers(); track o.key) { <option [value]="o.key">{{ o.label }}</option> }</select></div>
            <button type="submit" class="row-btn" [disabled]="busy()"><k-icon name="plus" [size]="18" />Add payment</button>
          </form>
        </div>
        <div class="sheet-acts">
          <button class="btn block" type="submit" form="expense-form" [disabled]="busy()">Save changes</button>
          <button type="button" class="btn danger block" (click)="remove()" [disabled]="busy()"><k-icon name="trash-2" [size]="18" />{{ confirmDelete() ? 'Tap again to delete' : 'Delete' }}</button>
        </div>
      } @else {
        <div class="sheet-acts"><button class="btn block" type="submit" form="expense-form" [disabled]="busy()">Add cost</button></div>
      }
    </k-sheet>
    <k-event-sheet [open]="editingEvent()" [eventId]="mode.eventId()" [mode]="mode.mode()" (closed)="editingEvent.set(false)" (saved)="summary.reload()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Budget {
  readonly open = input<string | undefined>();

  protected readonly mode = inject(ModeService);
  private readonly session = inject(SessionStore);
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly rm = rm;
  protected readonly names = this.session.names;
  protected readonly sheetOpen = signal(false);
  protected readonly editing = signal<Expense | null>(null);
  protected readonly editingEvent = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly confirmDelete = signal(false);

  private readonly url = (path: string) => () => {
    const id = this.mode.eventId();
    return id ? API + eventPath(id, path) : undefined;
  };
  protected readonly summary = httpResource<BudgetSummary>(this.url('/budget/summary'));
  protected readonly expenses = httpResource<Expense[]>(this.url('/expenses'), { defaultValue: [] });
  protected readonly categories = httpResource<Category[]>(this.url('/budget-categories'), { defaultValue: [] });

  protected readonly modeLabel = computed(() => MODES[this.mode.mode()].label);
  protected readonly payers = computed(() => {
    const n = this.names();
    return (['PARTNER_1', 'PARTNER_2', 'BOTH', 'OTHER'] as Payer[]).map(key => ({ key, label: n[key] }));
  });
  protected readonly groups = computed(() => {
    const byId = new Map(this.categories.value().map(c => [c.id, c]));
    const groups = new Map<string, { name: string; order: number; total: number; items: Expense[] }>();
    for (const e of this.expenses.value()) {
      const c = e.category_id ? byId.get(e.category_id) : undefined;
      const key = c?.name ?? 'Uncategorised';
      const g = groups.get(key) ?? { name: key, order: c?.sort_order ?? 999, total: 0, items: [] };
      g.items.push(e);
      g.total += this.cost(e);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.order - b.order);
  });

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(160)]],
    category_id: [''], cost: [''], balance_due_date: [''], notes: [''],
  });
  protected readonly payment = this.fb.group({ amount: [''], paid_on: [todayKL()], paid_by: ['PARTNER_1' as Payer] });

  constructor() {
    effect(() => {
      const id = this.open();
      const e = id ? this.expenses.value().find(x => x.id === id) : undefined;
      if (e && !this.sheetOpen()) this.openEdit(e);
    });
  }

  /** The agreed price once there is one, otherwise the estimate. */
  protected cost(e: Expense): number { return e.committed_sen || e.planned_sen; }
  protected isPaid(e: Expense): boolean { return this.cost(e) > 0 && e.paid_sen >= this.cost(e); }
  protected paidLine(e: Expense): string {
    if (this.isPaid(e)) return 'Paid';
    if (e.paid_sen) return `${rm(e.paid_sen)} paid · ${rm(this.cost(e) - e.paid_sen)} left`;
    return 'Not paid yet';
  }
  protected due(e: Expense) { return dueLabel(e.balance_due_date); }
  protected date(d: string) { return formatDate(d, { day: 'numeric', month: 'short', year: 'numeric' }); }

  protected openNew(): void {
    this.editing.set(null);
    this.form.reset({ name: '', category_id: '', cost: '', balance_due_date: '', notes: '' });
    this.show();
  }

  protected openEdit(e: Expense): void {
    this.editing.set(e);
    this.form.reset({ name: e.name, category_id: e.category_id ?? '', cost: senToInput(this.cost(e)),
                      balance_due_date: e.balance_due_date ?? '', notes: e.notes });
    this.payment.reset({ amount: '', paid_on: todayKL(), paid_by: this.session.myPartner() ?? 'PARTNER_1' });
    this.show();
  }

  private show(): void {
    this.error.set('');
    this.confirmDelete.set(false);
    this.sheetOpen.set(true);
  }

  protected close(): void {
    this.sheetOpen.set(false);
    if (this.open()) void this.router.navigate([], { queryParams: { open: null }, replaceUrl: true });
  }

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    const cost = toSen(v.cost);
    if (!v.name.trim()) return this.error.set('Say what this cost is for.');
    if (cost === null) return this.error.set('Enter the cost in RM, like 1250 or 1,250.50.');
    const e = this.editing();
    // One cost in the app; the agreed price follows it once one was recorded (e.g. from a vendor quote).
    const body = { name: v.name.trim(), category_id: v.category_id || null, planned_sen: cost,
                   ...(e?.committed_sen ? { committed_sen: cost } : {}),
                   balance_due_date: v.balance_due_date || null, notes: v.notes.trim() };
    const eventId = this.mode.eventId()!;
    await this.run(async () => {
      if (e) await this.api.patch(eventPath(eventId, `/expenses/${e.id}`), { ...body, version: e.version });
      else await this.api.post(eventPath(eventId, '/expenses'), body);
      this.toast.show(e ? 'Saved' : 'Cost added');
      this.close();
    });
  }

  protected async addPayment(): Promise<void> {
    const e = this.editing()!;
    const v = this.payment.getRawValue();
    const amount = toSen(v.amount);
    if (!amount) return this.error.set('Enter a payment amount above RM 0.00.');
    await this.run(async () => {
      const updated = await this.api.post<Expense>(eventPath(e.planning_event_id, `/expenses/${e.id}/payments`),
        { amount_sen: amount, paid_on: v.paid_on || todayKL(), paid_by: v.paid_by });
      this.editing.set(updated);
      this.payment.patchValue({ amount: '' });
      this.toast.show(`Payment of ${rm(amount)} recorded`);
    });
  }

  protected async removePayment(paymentId: string): Promise<void> {
    const e = this.editing()!;
    await this.run(async () => {
      this.editing.set(await this.api.delete(eventPath(e.planning_event_id, `/expenses/${e.id}/payments/${paymentId}`)) as Expense);
      this.toast.show('Payment removed');
    });
  }

  protected async remove(): Promise<void> {
    if (!this.confirmDelete()) return this.confirmDelete.set(true);
    const e = this.editing()!;
    await this.run(async () => {
      await this.api.delete(eventPath(e.planning_event_id, `/expenses/${e.id}`));
      this.toast.show('Cost deleted');
      this.close();
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
      this.expenses.reload();
      this.summary.reload();
    }
  }
}
