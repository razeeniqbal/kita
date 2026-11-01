import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api, errorMessage, eventPath } from '../core/api';
import { senToInput, toSen } from '../core/format';
import { EVENT_STATUS_LABEL, EventStatus, MODES, Mode, PlanningEvent } from '../core/models';
import { Toast } from '../core/ui';
import { Sheet } from './ui';

/** Edit a mode's milestone: name, date, status and target budget. */
@Component({
  selector: 'k-event-sheet',
  imports: [ReactiveFormsModule, Sheet],
  template: `
    <k-sheet [open]="open()" [title]="title()" (closed)="closed.emit()">
      <button sheetAction type="submit" form="event-form" class="r" [disabled]="busy() || !event()">Save</button>
      <form id="event-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (error()) { <div class="sheet-err" role="alert">{{ error() }}</div> }
        <div class="list">
          <div class="field stack"><label for="ev-name">Name</label><input id="ev-name" formControlName="event_name" maxlength="120"></div>
        </div>
        <div class="list">
          <div class="field"><label for="ev-date">Date</label><input id="ev-date" type="date" formControlName="target_date"></div>
          <div class="field stack"><span class="lab">Status</span>
            <div class="seg" role="radiogroup" aria-label="Status">
              @for (s of statuses; track s) { <label><input type="radio" formControlName="status" [value]="s"><span>{{ statusLabel[s] }}</span></label> }
            </div></div>
        </div>
        <div class="list">
          <div class="field"><label for="ev-budget">Target budget (RM)</label><input id="ev-budget" inputmode="decimal" formControlName="target_budget" placeholder="0.00"></div>
        </div>
        <div class="sheet-acts"><button class="btn block" type="submit" [disabled]="busy() || !event()">Save changes</button></div>
      </form>
    </k-sheet>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventSheet {
  readonly open = input(false);
  readonly eventId = input<string | null>(null);
  readonly mode = input<Mode>('TUNANG');
  readonly closed = output<void>();
  readonly saved = output<PlanningEvent>();

  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  protected readonly statuses: EventStatus[] = ['PLANNING', 'CONFIRMED', 'COMPLETED'];
  protected readonly statusLabel = EVENT_STATUS_LABEL;
  protected readonly event = signal<PlanningEvent | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly title = () => `${MODES[this.mode()].label} details`;
  protected readonly form = inject(NonNullableFormBuilder).group({
    event_name: ['', [Validators.required, Validators.maxLength(120)]],
    target_date: [''],
    status: ['PLANNING' as EventStatus],
    target_budget: [''],
  });

  constructor() {
    effect(() => {
      const id = this.eventId();
      if (this.open() && id) void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    this.error.set('');
    this.event.set(null);
    try {
      const ev = await this.api.get<PlanningEvent>(eventPath(id));
      this.event.set(ev);
      this.form.reset({ event_name: ev.event_name, target_date: ev.target_date ?? '', status: ev.status,
                        target_budget: senToInput(ev.target_budget_sen) });
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  protected async save(): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    const v = this.form.getRawValue();
    const budget = toSen(v.target_budget);
    if (!v.event_name.trim()) return this.error.set('Give this milestone a name.');
    if (budget === null) return this.error.set('Target budget must be an amount in RM, like 15000 or 15,000.00.');
    this.busy.set(true);
    try {
      const updated = await this.api.patch<PlanningEvent>(eventPath(ev.id), {
        version: ev.version, event_name: v.event_name.trim(), target_date: v.target_date || null,
        status: v.status, target_budget_sen: budget,
      });
      this.toast.show('Saved');
      this.saved.emit(updated);
      this.closed.emit();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
