import { ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, errorMessage, eventPath } from '../core/api';
import { dueLabel, formatDate, rm } from '../core/format';
import { Assignee, CALENDAR_TYPE_LABEL, CalendarItem, MODES, SLUG_OF, Task } from '../core/models';
import { ModeService } from '../core/mode';
import { SessionStore } from '../core/session';
import { Toast } from '../core/ui';
import { Icon, IconName } from './icon';

export function actorName(session: SessionStore, userId: string | null): string {
  const member = session.workspace()?.members.find(m => m.user_id === userId);
  return member ? session.names()[member.partner_slot === 1 ? 'PARTNER_1' : 'PARTNER_2'] : 'Someone';
}

/** A checklist row. The circle marks it done or not done straight away. */
@Component({
  selector: 'k-task-row',
  imports: [RouterLink, Icon],
  template: `
    @let t = task();
    <div class="row" [class.is-done]="done()" style="--inset:52px">
      <button type="button" class="check" [class.on]="done()" (click)="toggle()" [disabled]="busy()"
              [attr.aria-label]="(done() ? 'Mark not done: ' : 'Mark done: ') + t.title"><k-icon name="check" [size]="14" [stroke]="3" /></button>
      @if (linkToChecklist()) {
        <a class="row-main" [routerLink]="['/', mode.slug(), 'checklist']" [queryParams]="{ open: t.id }">
          <span class="t">{{ t.title }}</span><span class="s">{{ meta() }}</span></a>
      } @else {
        <button type="button" class="row-main" (click)="opened.emit()"><span class="t">{{ t.title }}</span><span class="s">{{ meta() }}</span></button>
      }
      <span class="row-end">
        @if (t.status === 'IN_PROGRESS') { <span class="pill acc">In progress</span> }
        @if (t.status === 'POSTPONED') { <span class="pill"><k-icon name="pause" [size]="12" />Postponed</span> }
        @if (t.priority === 'HIGH' && !done()) { <span class="pill warn"><k-icon name="flag" [size]="12" />High</span> }
        @if (due(); as d) { <span class="pill" [class.warn]="d.tone === 'warn'" [class.bad]="d.tone === 'bad'">{{ d.text }}</span> }
      </span>
    </div>`,
  styles: ':host{display:block}',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskRow {
  readonly task = input.required<Task>();
  readonly linkToChecklist = input(false, { transform: booleanAttribute });
  readonly opened = output<void>();
  readonly changed = output<Task>();

  protected readonly mode = inject(ModeService);
  private readonly session = inject(SessionStore);
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  protected readonly busy = signal(false);
  private readonly optimistic = signal<boolean | null>(null);

  protected readonly done = computed(() => this.optimistic() ?? this.task().status === 'DONE');
  protected readonly due = computed(() => {
    const t = this.task();
    return t.status === 'DONE' || t.status === 'POSTPONED' ? null : dueLabel(t.due_date);
  });
  protected readonly meta = computed(() => {
    const t = this.task();
    return [this.session.names()[t.assignee], t.description.slice(0, 70)].filter(Boolean).join(' · ');
  });

  protected async toggle(): Promise<void> {
    const t = this.task();
    const next = this.done() ? 'NOT_STARTED' : 'DONE';
    this.busy.set(true);
    this.optimistic.set(next === 'DONE');
    try {
      const updated = await this.api.patch<Task>(eventPath(t.planning_event_id, `/tasks/${t.id}`), { version: t.version, status: next });
      this.changed.emit(updated);
    } catch (e) {
      this.toast.show(errorMessage(e));
      this.changed.emit(t);
    } finally {
      this.optimistic.set(null);
      this.busy.set(false);
    }
  }
}

const KIND_ICON: Record<CalendarItem['kind'], IconName> = {
  EVENT_DAY: 'heart', TASK_DUE: 'list-checks', PAYMENT_DUE: 'wallet', APPOINTMENT: 'clock', VENUE_VISIT: 'map-pin',
  FAMILY_DISCUSSION: 'users', FITTING: 'shirt', PAYMENT: 'wallet', OTHER: 'calendar',
};

/** One date on the calendar. Opens the record it comes from; the other mode's dates are read-only. */
@Component({
  selector: 'k-calendar-row',
  imports: [RouterLink, Icon],
  template: `
    @let i = item();
    <div class="row" style="--inset:76px">
      <div class="datebox"><span>{{ weekday() }}</span><b>{{ day() }}</b></div>
      @if (link(); as l) {
        <a class="row-main" [routerLink]="l.path" [queryParams]="{ open: l.id }"><span class="t">{{ i.title }}</span><span class="s">{{ sub() }}</span></a>
      } @else {
        <div class="row-main"><span class="t">{{ i.title }}</span><span class="s">{{ sub() }}</span></div>
      }
      <span class="row-end">
        @if (late()) { <span class="pill bad">Overdue</span> }
        @if (i.read_only) { <span class="pill">{{ modeLabel() }}</span> }
        <span class="kind-ic" [class.other-mode]="i.read_only" [attr.title]="kindLabel()"><k-icon [name]="icon()" [size]="17" /></span>
      </span>
    </div>`,
  styles: ':host{display:block}',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarRow {
  readonly item = input.required<CalendarItem>();
  private readonly session = inject(SessionStore);

  protected readonly weekday = computed(() => formatDate(this.item().date, { weekday: 'short' }));
  protected readonly day = computed(() => Number(this.item().date.slice(8, 10)));
  protected readonly icon = computed(() => KIND_ICON[this.item().kind]);
  protected readonly modeLabel = computed(() => MODES[this.item().mode].label);
  protected readonly late = computed(() => {
    const i = this.item();
    return (i.kind === 'TASK_DUE' || i.kind === 'PAYMENT_DUE') && i.date < new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
  });
  protected readonly kindLabel = computed(() => {
    const k = this.item().kind;
    return k === 'EVENT_DAY' ? 'Event day' : k === 'TASK_DUE' ? 'Task due' : k === 'PAYMENT_DUE' ? 'Payment due' : CALENDAR_TYPE_LABEL[k];
  });
  protected readonly sub = computed(() => {
    const i = this.item();
    if (i.kind === 'EVENT_DAY') return `${this.modeLabel()} day`;
    if (i.kind === 'TASK_DUE') return `Task due · ${this.session.names()[i.detail as Assignee] ?? ''}`;
    if (i.kind === 'PAYMENT_DUE') return `${rm(Number(i.detail))} balance due`;
    return [CALENDAR_TYPE_LABEL[i.kind], i.time?.slice(0, 5), i.detail].filter(Boolean).join(' · ');
  });
  protected readonly link = computed(() => {
    const i = this.item();
    if (i.read_only || !i.ref) return null;
    const page = i.ref.type === 'task' ? 'checklist' : i.ref.type === 'expense' ? 'budget' : 'calendar';
    return { path: ['/', SLUG_OF[i.mode], page], id: i.ref.id };
  });
}
