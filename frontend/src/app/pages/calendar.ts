import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { API, Api, errorMessage, eventPath } from '../core/api';
import { formatDate, todayKL } from '../core/format';
import { ModeService } from '../core/mode';
import { CALENDAR_TYPE_LABEL, CalendarEvent, CalendarItem, CalendarType, MODES } from '../core/models';
import { Toast } from '../core/ui';
import { Icon } from '../shared/icon';
import { CalendarRow } from '../shared/rows';
import { EmptyState, Sheet } from '../shared/ui';

type Range = 'upcoming' | 'past';

@Component({
  selector: 'k-calendar',
  imports: [ReactiveFormsModule, Icon, CalendarRow, EmptyState, Sheet],
  template: `
    <div class="ph">
      <div class="ph-t"><div class="eyebrow acc">{{ modeLabel() }}</div><h1>Calendar</h1>
        <p class="sub">Appointments you add, plus task due dates, payment deadlines and the event date.</p></div>
      <button type="button" class="btn" (click)="openNew()"><k-icon name="plus" [size]="18" />Add appointment</button>
    </div>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Time range">
        <button type="button" [attr.aria-pressed]="range() === 'upcoming'" (click)="range.set('upcoming')">Upcoming</button>
        <button type="button" [attr.aria-pressed]="range() === 'past'" (click)="range.set('past')">Past</button>
      </div>
      <button type="button" class="chip" [attr.aria-pressed]="both()" (click)="both.set(!both())">Show {{ otherLabel() }} too</button>
    </div>

    @if (items.hasValue() && items.value().length) {
      @for (m of months(); track m.key) {
        <div class="sec-h"><span>{{ m.label }}</span></div>
        <div class="list">@for (i of m.items; track $index) { <k-calendar-row [item]="i" /> }</div>
      }
    } @else if (items.hasValue()) {
      <div style="height:12px"></div>
      <k-empty art="calendar" [title]="range() === 'past' ? 'Nothing in the past yet' : 'Nothing scheduled'"
        text="Task due dates, payment deadlines and the event date appear here on their own. Add appointments, venue visits and family discussions yourself."
        [action]="range() === 'past' ? '' : 'Add appointment'" (act)="openNew()" />
    } @else { <div class="empty">Loading calendar…</div> }

    <k-sheet [open]="sheetOpen()" [title]="editing() ? 'Appointment' : 'New appointment'" (closed)="close()">
      <button sheetAction type="submit" form="cal-form" class="r" [disabled]="busy()">{{ editing() ? 'Save' : 'Add' }}</button>
      <form id="cal-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (error()) { <div class="sheet-err" role="alert">{{ error() }}</div> }
        <div class="list"><div class="field stack"><label for="c-title">Title</label><input id="c-title" formControlName="title" maxlength="200" placeholder="e.g. Visit dewan in Shah Alam"></div></div>
        <div class="list">
          <div class="field"><label for="c-date">Date</label><input id="c-date" type="date" formControlName="event_date"></div>
          <div class="field"><label for="c-time">Time</label><input id="c-time" type="time" formControlName="start_time"></div>
          <div class="field"><label for="c-type">Type</label><select id="c-type" formControlName="type">
            @for (t of types; track t) { <option [value]="t">{{ typeLabel[t] }}</option> }</select></div>
          <div class="field"><label for="c-loc">Location</label><input id="c-loc" formControlName="location" maxlength="200"></div>
        </div>
        <div class="list"><div class="field stack"><label for="c-notes">Notes</label><textarea id="c-notes" formControlName="notes" rows="3"></textarea></div></div>
        <div class="sheet-acts">
          <button class="btn block" type="submit" [disabled]="busy()">{{ editing() ? 'Save changes' : 'Add appointment' }}</button>
          @if (editing()) {
            <button type="button" class="btn danger block" (click)="remove()" [disabled]="busy()"><k-icon name="trash-2" [size]="18" />{{ confirmDelete() ? 'Tap again to delete' : 'Delete' }}</button>
          }
        </div>
      </form>
    </k-sheet>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarPage {
  /** ?open=<calendar event id> */
  readonly open = input<string | undefined>();

  private readonly mode = inject(ModeService);
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);

  protected readonly types: CalendarType[] = ['APPOINTMENT', 'VENUE_VISIT', 'FAMILY_DISCUSSION', 'FITTING', 'PAYMENT', 'OTHER'];
  protected readonly typeLabel = CALENDAR_TYPE_LABEL;
  protected readonly range = signal<Range>('upcoming');
  protected readonly both = signal(false);
  protected readonly sheetOpen = signal(false);
  protected readonly editing = signal<CalendarEvent | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly confirmDelete = signal(false);

  protected readonly items = httpResource<CalendarItem[]>(() => {
    const id = this.mode.eventId();
    return id ? { url: API + eventPath(id, '/calendar'), params: { range: this.range(), include_other_mode: this.both() } } : undefined;
  }, { defaultValue: [] });

  protected readonly modeLabel = computed(() => MODES[this.mode.mode()].label);
  protected readonly otherLabel = computed(() => MODES[MODES[this.mode.mode()].other].label);
  protected readonly months = computed(() => {
    const out: { key: string; label: string; items: CalendarItem[] }[] = [];
    for (const i of this.items.value()) {
      const key = i.date.slice(0, 7);
      let m = out.at(-1);
      if (!m || m.key !== key) out.push(m = { key, label: formatDate(`${key}-01`, { month: 'long', year: 'numeric' }), items: [] });
      m.items.push(i);
    }
    return out;
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    event_date: [todayKL()], start_time: [''], type: ['APPOINTMENT' as CalendarType], location: [''], notes: [''],
  });

  constructor() {
    effect(() => {
      const id = this.open();
      const eventId = this.mode.eventId();
      if (id && eventId && !this.sheetOpen()) void this.loadAndEdit(eventId, id);
    });
  }

  private async loadAndEdit(eventId: string, id: string): Promise<void> {
    try {
      const ev = await this.api.get<CalendarEvent>(eventPath(eventId, `/calendar-events/${id}`));
      this.editing.set(ev);
      this.form.reset({ title: ev.title, event_date: ev.event_date, start_time: ev.start_time?.slice(0, 5) ?? '', type: ev.type,
                        location: ev.location, notes: ev.notes });
      this.show();
    } catch (e) {
      this.toast.show(errorMessage(e));
    }
  }

  protected openNew(): void {
    this.editing.set(null);
    this.form.reset({ title: '', event_date: todayKL(), start_time: '', type: 'APPOINTMENT', location: '', notes: '' });
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
    if (!v.title.trim()) return this.error.set('Give the appointment a title.');
    if (!v.event_date) return this.error.set('Choose a date.');
    const body = { ...v, title: v.title.trim(), start_time: v.start_time || null, location: v.location.trim(), notes: v.notes.trim() };
    const e = this.editing();
    const eventId = this.mode.eventId()!;
    await this.run(async () => {
      if (e) await this.api.patch(eventPath(eventId, `/calendar-events/${e.id}`), { ...body, version: e.version });
      else await this.api.post(eventPath(eventId, '/calendar-events'), body);
      this.toast.show(e ? 'Saved' : 'Added to the calendar');
    });
  }

  protected async remove(): Promise<void> {
    if (!this.confirmDelete()) return this.confirmDelete.set(true);
    const e = this.editing()!;
    await this.run(async () => {
      await this.api.delete(eventPath(e.planning_event_id, `/calendar-events/${e.id}`));
      this.toast.show('Deleted');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      this.close();
      this.items.reload();
    } catch (err) {
      this.error.set(errorMessage(err));
      this.confirmDelete.set(false);
    } finally {
      this.busy.set(false);
    }
  }
}
