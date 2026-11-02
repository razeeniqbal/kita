import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { API, Api, errorMessage, eventPath, isConflict } from '../core/api';
import { formatTimestamp } from '../core/format';
import { ModeService } from '../core/mode';
import {
  Assignee, Category, Expense, MODES, Priority, STATUS_LABEL, TASK_SECTIONS, Task, TaskStatus,
} from '../core/models';
import { SessionStore } from '../core/session';
import { Toast } from '../core/ui';
import { Icon } from '../shared/icon';
import { TaskRow, actorName } from '../shared/rows';
import { Picker, expensePickerItems } from '../shared/picker';
import { EmptyState, Sheet } from '../shared/ui';

type StatusFilter = 'open' | 'all' | TaskStatus;
const STATUS_ORDER: Record<TaskStatus, number> = { IN_PROGRESS: 0, NOT_STARTED: 1, POSTPONED: 2, DONE: 3 };
const PRIORITY_ORDER: Record<Priority, number> = { HIGH: 0, NORMAL: 1, LOW: 2 };

@Component({
  selector: 'k-checklist',
  imports: [ReactiveFormsModule, Icon, TaskRow, EmptyState, Picker, Sheet],
  template: `
    <div class="ph">
      <div class="ph-t"><div class="eyebrow acc">{{ modeLabel() }}</div><h1>Checklist</h1>
        <p class="sub">{{ progressText() }}</p></div>
      <button type="button" class="btn" (click)="openNew()"><k-icon name="plus" [size]="18" />Add task</button>
    </div>

    @if (tasks.hasValue() && tasks.value().length) {
      <div class="toolbar">
        @for (o of owners(); track o.key) {
          <button type="button" class="chip" [attr.aria-pressed]="owner() === o.key" (click)="owner.set(o.key)">{{ o.label }}</button>
        }
        <select class="sel" aria-label="Status filter" [value]="status()" (change)="status.set($any($event.target).value)">
          <option value="open">Not done</option><option value="all">All statuses</option>
          @for (s of statuses; track s) { <option [value]="s">{{ statusLabel[s] }}</option> }
        </select>
      </div>
      @for (g of groups(); track g.name) {
        <div class="sec-h"><span><span class="dot"></span>{{ g.name }}</span><b>{{ g.done }}/{{ g.total }} done</b></div>
        @if (g.tasks.length) {
          <div class="list">@for (t of g.tasks; track t.id) { <k-task-row [task]="t" (opened)="openEdit(t)" (changed)="tasks.reload()" /> }</div>
        } @else { <div class="empty">Nothing here with these filters.</div> }
      }
    } @else if (tasks.hasValue()) {
      <k-empty art="checklist-papers" title="Start with one small step." text="Add your first task for this milestone." action="Add task" (act)="openNew()" />
    } @else if (tasks.error()) {
      <div class="empty"><b>Couldn't load the checklist</b><div><button type="button" class="btn sm" (click)="tasks.reload()">Try again</button></div></div>
    } @else { <div class="empty">Loading checklist…</div> }

    <k-sheet [open]="sheetOpen()" [title]="editing() ? 'Task' : 'New task'" (closed)="close()">
      <button sheetAction type="submit" form="task-form" class="r" [disabled]="busy()">{{ editing() ? 'Save' : 'Add' }}</button>
      <form id="task-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (error()) { <div class="sheet-err" role="alert">{{ error() }}</div> }
        <div class="list">
          <div class="field stack"><label for="t-title">Title</label><input id="t-title" formControlName="title" maxlength="300" placeholder="e.g. Memilih cincin pertunangan"></div>
          <div class="field"><label for="t-status">Status</label><select id="t-status" formControlName="status">
            @for (s of statuses; track s) { <option [value]="s">{{ statusLabel[s] }}</option> }</select></div>
          <div class="field"><label for="t-due">Due date</label><input id="t-due" type="date" formControlName="due_date"></div>
          <div class="field"><label for="t-who">Who</label><select id="t-who" formControlName="assignee">
            @for (a of assignees(); track a.key) { <option [value]="a.key">{{ a.label }}</option> }</select></div>
        </div>
        <div class="list">
          <div class="field stack"><label for="t-desc">Notes</label><textarea id="t-desc" formControlName="description" rows="2" placeholder="Optional"></textarea></div>
          <div class="field"><label for="t-cat">Section</label><select id="t-cat" formControlName="category">
            @for (c of sections(); track c) { <option [value]="c">{{ c }}</option> }</select></div>
          <k-picker label="Cost" [items]="expenseItems()" [value]="form.controls.expense_id.value || null"
            emptyText="No budget lines yet. Add them in Budget." (changed)="form.controls.expense_id.setValue($event ?? '')" />
        </div>
        @if (editing(); as t) {
          <p class="sheet-meta">Last updated by {{ actor(t.updated_by) }} · {{ stamp(t.updated_at) }}</p>
          <div class="sheet-acts">
            <button class="btn block" type="submit" [disabled]="busy()">Save changes</button>
            <button type="button" class="btn secondary block" (click)="move()" [disabled]="busy()">
              <k-icon name="arrow-left-right" [size]="18" />{{ confirm() === 'move' ? 'Tap again to move to ' + otherLabel() : 'Move to ' + otherLabel() }}</button>
            <button type="button" class="btn danger block" (click)="remove()" [disabled]="busy()">
              <k-icon name="trash-2" [size]="18" />{{ confirm() === 'delete' ? 'Tap again to delete' : 'Delete' }}</button>
          </div>
        } @else {
          <div class="sheet-acts"><button class="btn block" type="submit" [disabled]="busy()">Add task</button></div>
        }
      </form>
    </k-sheet>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Checklist {
  /** ?open=<task id> opens that task, e.g. from the overview or calendar. */
  readonly open = input<string | undefined>();

  private readonly modeService = inject(ModeService);
  private readonly session = inject(SessionStore);
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);

  protected readonly statuses: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'POSTPONED'];
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly owner = signal<Assignee | 'ALL'>('ALL');
  protected readonly status = signal<StatusFilter>('open');
  protected readonly sheetOpen = signal(false);
  protected readonly editing = signal<Task | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly confirm = signal<'move' | 'delete' | null>(null);

  protected readonly tasks = httpResource<Task[]>(() => {
    const id = this.modeService.eventId();
    return id ? API + eventPath(id, '/tasks') : undefined;
  }, { defaultValue: [] });
  protected readonly expenses = httpResource<Expense[]>(() => {
    const id = this.modeService.eventId();
    return id ? API + eventPath(id, '/expenses') : undefined;
  }, { defaultValue: [] });
  private readonly categories = httpResource<Category[]>(() => {
    const id = this.modeService.eventId();
    return id ? API + eventPath(id, '/budget-categories') : undefined;
  }, { defaultValue: [] });
  protected readonly expenseItems = computed(() => expensePickerItems(this.expenses.value(), this.categories.value()));

  protected readonly modeLabel = computed(() => MODES[this.modeService.mode()].label);
  protected readonly otherLabel = computed(() => MODES[MODES[this.modeService.mode()].other].label);
  protected readonly sections = computed(() => TASK_SECTIONS[this.modeService.mode()]);
  protected readonly owners = computed(() => {
    const n = this.session.names();
    return [{ key: 'ALL' as const, label: 'Everyone' }, { key: 'PARTNER_1' as const, label: n.PARTNER_1 },
            { key: 'PARTNER_2' as const, label: n.PARTNER_2 }, { key: 'BOTH' as const, label: 'Both' },
            { key: 'UNASSIGNED' as const, label: 'Unassigned' }];
  });
  protected readonly assignees = computed(() => this.owners().slice(1) as { key: Assignee; label: string }[]);
  protected readonly progressText = computed(() => {
    const all = this.tasks.value();
    return all.length ? `${all.filter(t => t.status === 'DONE').length} of ${all.length} tasks done.` : '';
  });
  protected readonly groups = computed(() => {
    const all = this.tasks.value();
    const owner = this.owner();
    const status = this.status();
    const shown = all.filter(t => (owner === 'ALL' || t.assignee === owner)
      && (status === 'all' || (status === 'open' ? t.status !== 'DONE' : t.status === status)));
    const known = this.sections();
    const sectionOf = (t: Task) => (known.includes(t.category) ? t.category : 'Lain-lain');
    return known
      .map(name => {
        const inSection = all.filter(t => sectionOf(t) === name);
        return {
          name, total: inSection.length, done: inSection.filter(t => t.status === 'DONE').length,
          tasks: shown.filter(t => sectionOf(t) === name).sort((a, b) =>
            STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
            || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.sort_order - b.sort_order),
        };
      })
      .filter(g => g.total > 0);
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    title: ['', [Validators.required, Validators.maxLength(300)]],
    description: [''],
    category: [''],
    status: ['NOT_STARTED' as TaskStatus],
    priority: ['NORMAL' as Priority],
    due_date: [''],
    assignee: ['UNASSIGNED' as Assignee],
    expense_id: [''],
  });

  constructor() {
    effect(() => {
      const id = this.open();
      const task = id ? this.tasks.value().find(t => t.id === id) : undefined;
      if (task && !this.sheetOpen()) this.openEdit(task);
    });
  }

  protected openNew(): void {
    this.editing.set(null);
    this.form.reset({ title: '', description: '', category: this.sections()[0], status: 'NOT_STARTED', priority: 'NORMAL',
                      due_date: '', assignee: 'UNASSIGNED', expense_id: '' });
    this.showSheet();
  }

  protected openEdit(t: Task): void {
    this.editing.set(t);
    this.form.reset({ title: t.title, description: t.description, category: this.sections().includes(t.category) ? t.category : 'Lain-lain',
                      status: t.status, priority: t.priority, due_date: t.due_date ?? '', assignee: t.assignee,
                      expense_id: t.expense_id ?? '' });
    this.showSheet();
  }

  private showSheet(): void {
    this.error.set('');
    this.confirm.set(null);
    this.sheetOpen.set(true);
  }

  protected close(): void {
    this.sheetOpen.set(false);
    if (this.open()) void this.router.navigate([], { queryParams: { open: null }, replaceUrl: true });
  }

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    if (!v.title.trim()) return this.error.set('Give the task a title.');
    const body = { ...v, title: v.title.trim(), description: v.description.trim(), due_date: v.due_date || null, expense_id: v.expense_id || null };
    const eventId = this.modeService.eventId()!;
    const editing = this.editing();
    await this.run(async () => {
      if (editing) await this.api.patch(eventPath(eventId, `/tasks/${editing.id}`), { ...body, version: editing.version });
      else await this.api.post(eventPath(eventId, '/tasks'), body);
      this.toast.show(editing ? 'Saved' : 'Task added');
    });
  }

  protected async move(): Promise<void> {
    if (this.confirm() !== 'move') return this.confirm.set('move');
    const t = this.editing()!;
    await this.run(async () => {
      await this.api.post(eventPath(t.planning_event_id, `/tasks/${t.id}/move`), { version: t.version });
      this.toast.show(`Moved to ${this.otherLabel()}`);
    });
  }

  protected async remove(): Promise<void> {
    if (this.confirm() !== 'delete') return this.confirm.set('delete');
    const t = this.editing()!;
    await this.run(async () => {
      await this.api.delete(eventPath(t.planning_event_id, `/tasks/${t.id}`));
      this.toast.show('Task deleted');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      this.close();
      this.tasks.reload();
    } catch (e) {
      this.error.set(errorMessage(e));
      this.confirm.set(null);
      if (isConflict(e)) this.tasks.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected actor(userId: string | null | undefined): string {
    return actorName(this.session, userId ?? null);
  }
  protected readonly stamp = formatTimestamp;
}
