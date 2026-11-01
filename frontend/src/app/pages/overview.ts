import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { API, eventPath } from '../core/api';
import { countdown, formatDate } from '../core/format';
import { ModeService } from '../core/mode';
import { Activity, Dashboard, EVENT_STATUS_LABEL, MODES } from '../core/models';
import { SessionStore } from '../core/session';
import { Art } from '../shared/art';
import { BudgetCard } from '../shared/budget-card';
import { CalendarRow, TaskRow, actorName } from '../shared/rows';
import { EventSheet } from '../shared/event-sheet';
import { Icon } from '../shared/icon';
import { Ring } from '../shared/ui';

@Component({
  selector: 'k-overview',
  imports: [RouterLink, Art, BudgetCard, CalendarRow, TaskRow, EventSheet, Icon, Ring],
  template: `
    @if (dash.value(); as d) {
      <div class="grid">
        <section class="card hero span">
          <div>
            <div class="eyebrow acc">{{ meta().eyebrow }}</div>
            <h1 class="hero-h">{{ d.event.event_name }}</h1>
            @if (d.event.target_date) { <p class="sub">{{ longDate(d.event.target_date) }}</p> }
            @if (cd(); as c) {
              <div class="cd"><span class="cd-n" [class.word-n]="c.word">{{ c.value }}</span><span class="cd-u">{{ c.unit }}</span></div>
            } @else {
              <p class="cd-empty">We haven't picked a date yet.
                <button type="button" class="btn sm secondary" (click)="editing.set(true)"><k-icon name="calendar-plus" [size]="18" />Set a date</button></p>
            }
            <div class="hero-meta"><span class="pill acc">{{ statusLabel[d.event.status] }}</span><span class="tagline" style="font-size:14px">{{ meta().line }}</span></div>
          </div>
          <div class="hero-art"><k-art [name]="meta().cover" sizes="340px" eager /></div>
          <button type="button" class="icon-btn hero-edit" (click)="editing.set(true)" [attr.aria-label]="'Edit ' + meta().label + ' details'"><k-icon name="pencil" /></button>
        </section>

        <section class="card">
          <div class="card-h"><h2>Progress</h2><a class="link" routerLink="checklist">Checklist<k-icon name="chevron-right" [size]="16" /></a></div>
          <div class="prog"><k-ring [percent]="d.progress.percent" />
            <div class="prog-l"><span><span class="big-n">{{ d.progress.done }}</span> of <b>{{ d.progress.total }}</b> tasks done</span>
              <span><b>{{ d.progress.in_progress }}</b> in progress · <b>{{ d.progress.not_started }}</b> not started · <b>{{ d.progress.postponed }}</b> postponed</span></div></div>
        </section>

        <section class="card">
          <div class="card-h"><h2>Budget</h2><a class="link" routerLink="budget">Details<k-icon name="chevron-right" [size]="16" /></a></div>
          <k-budget-card [summary]="d.budget" compact />
        </section>

        <section class="card">
          <div class="card-h"><h2>Next actions</h2><a class="link" routerLink="checklist">Checklist<k-icon name="chevron-right" [size]="16" /></a></div>
          @if (d.next_actions.length) {
            <div class="list">@for (t of d.next_actions; track t.id) { <k-task-row [task]="t" linkToChecklist (changed)="dash.reload()" /> }</div>
          } @else {
            <div class="empty"><b>{{ d.progress.total ? 'All caught up' : 'Start with one small step.' }}</b>{{ d.progress.total ? 'Nothing open right now.' : 'Add your first task in the checklist.' }}</div>
          }
        </section>

        <section class="card">
          <div class="card-h"><h2>Coming up</h2><a class="link" routerLink="calendar">Calendar<k-icon name="chevron-right" [size]="16" /></a></div>
          @if (d.upcoming.length) {
            <div class="list">@for (i of d.upcoming; track $index) { <k-calendar-row [item]="i" /> }</div>
          } @else { <div class="empty">No dates, deadlines or payments ahead yet.</div> }
        </section>

        <section class="card">
          <div class="card-h"><h2>People &amp; vendors</h2></div>
          <div class="kv">
            <div><span>Guests</span><b>{{ d.guests.total }}</b></div><div><span>Seats confirmed</span><b>{{ d.guests.seats_confirmed }}</b></div>
            <div><span>RSVP pending</span><b>{{ d.guests.rsvp_pending }}</b></div><div><span>Vendors booked</span><b>{{ d.vendors_booked }}</b></div>
            <div><span>Documents</span><b>{{ d.documents }}</b></div>
          </div>
        </section>

        <section class="card">
          <div class="card-h"><h2>Recent activity</h2><a class="link" routerLink="/activity">All<k-icon name="chevron-right" [size]="16" /></a></div>
          @if (activity.value()?.length) {
            <div class="list">
              @for (a of activity.value(); track a.id) {
                <div class="row"><div class="row-main"><span class="t"><b style="font-weight:600">{{ who(a) }}</b> {{ a.summary }}</span>
                  <span class="s">{{ when(a.created_at) }}</span></div></div>
              }
            </div>
          } @else { <div class="empty">Changes either of you make will show up here.</div> }
        </section>
      </div>
    } @else if (dash.error()) {
      <div class="empty"><b>Couldn't load this page</b>Check your connection, then try again.
        <div><button type="button" class="btn sm" (click)="dash.reload()">Try again</button></div></div>
    } @else {
      <div class="empty">Loading…</div>
    }
    <k-event-sheet [open]="editing()" [eventId]="mode.eventId()" [mode]="mode.mode()" (closed)="editing.set(false)" (saved)="dash.reload()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Overview {
  protected readonly mode = inject(ModeService);
  private readonly session = inject(SessionStore);
  protected readonly editing = signal(false);
  protected readonly statusLabel = EVENT_STATUS_LABEL;
  protected readonly meta = computed(() => MODES[this.mode.mode()]);

  protected readonly dash = httpResource<Dashboard>(() => {
    const id = this.mode.eventId();
    return id ? API + eventPath(id, '/dashboard') : undefined;
  });
  protected readonly activity = httpResource<Activity[]>(() => {
    const id = this.mode.eventId();
    return id ? { url: `${API}/activity`, params: { planning_event_id: id, limit: 5 } } : undefined;
  });
  protected readonly cd = computed(() => countdown(this.dash.value()?.event.target_date ?? null));

  protected longDate(date: string): string {
    return formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  protected who(a: Activity): string {
    return actorName(this.session, a.actor_user_id);
  }
  protected readonly when = (iso: string) => new Date(iso).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
