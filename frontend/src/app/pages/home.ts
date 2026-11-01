import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HttpResourceRef, httpResource } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { API, eventPath } from '../core/api';
import { countdown, formatDate } from '../core/format';
import { ModeService } from '../core/mode';
import { Dashboard, EVENT_STATUS_LABEL, MODES, Mode, Note, SLUG_OF } from '../core/models';
import { SessionStore } from '../core/session';
import { Art, Emblem } from '../shared/art';
import { Icon } from '../shared/icon';

/** Landing page (spec 16.2): both journeys side by side, never mixed. */
@Component({
  selector: 'k-home',
  imports: [RouterLink, Art, Emblem, Icon],
  template: `
    <section class="welcome">
      <k-emblem [size]="84" />
      <div class="eyebrow">{{ names().PARTNER_1 }} &amp; {{ names().PARTNER_2 }}</div>
      <h1>Perjalanan Kita</h1>
      <p class="sub tagline">Our journey, thoughtfully planned.</p>
    </section>

    <div class="modes">
      @for (c of cards(); track c.mode) {
        <article class="mode-card" [class]="'mode-card m-' + c.slug">
          <k-art [name]="c.meta.cover" sizes="(max-width: 899px) 100vw, 560px" eager />
          <div class="mc-body">
            <div class="eyebrow acc">{{ c.meta.label }} · {{ c.meta.eyebrow }}</div>
            @if (c.dash; as d) {
              <h2>{{ d.event.event_name }}</h2>
              <div class="mc-meta">{{ d.event.target_date ? longDate(d.event.target_date) : "We haven't picked a date yet" }} · {{ statusLabel[d.event.status] }}</div>
              @if (countdownOf(d.event.target_date); as cd) { <div class="mc-cd"><b>{{ cd.value }}</b><span>{{ cd.unit }}</span></div> }
              <div class="bar" role="img" [attr.aria-label]="d.progress.percent + ' percent complete'"><i [style.width.%]="d.progress.percent"></i></div>
              <div class="mc-meta">{{ d.progress.done }} of {{ d.progress.total }} tasks done</div>
              @if (d.next_actions[0]; as next) { <div class="mc-next"><span>Next up</span>{{ next.title }}</div> }
            } @else { <h2>{{ c.meta.label }}</h2><div class="mc-meta">Loading…</div> }
            <a class="btn" [routerLink]="mode.link(c.slug)">Open {{ c.meta.label }}<k-icon name="chevron-right" [size]="18" /></a>
          </div>
        </article>
      }
    </div>

    <section class="card together">
      <k-art name="journey-ribbons" sizes="180px" />
      <div style="min-width:0">
        <div class="card-h" style="margin-bottom:8px"><h2>Our milestones</h2></div>
        <div class="list">
          @for (c of cards(); track c.mode) {
            <div class="row" [class]="'row m-' + c.slug"><span class="pill acc">{{ c.meta.label }}</span>
              <div class="row-main"><span class="t">{{ c.dash?.event?.event_name ?? c.meta.label }}</span>
                <span class="s">{{ c.dash?.event?.target_date ? longDate(c.dash!.event.target_date) : 'Date to be decided' }}</span></div></div>
          }
          @for (n of pinned(); track n.id) {
            <div class="row" [class]="'row m-' + n.slug"><span class="pill acc"><k-icon name="pin" [size]="12" />Note</span>
              <div class="row-main"><span class="t">{{ n.title }}</span>@if (n.body) { <span class="s">{{ n.body.slice(0, 90) }}</span> }</div></div>
          }
        </div>
        <p class="formula">Budgets, tasks and guests are never combined. Each mode keeps its own records.</p>
      </div>
    </section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  protected readonly mode = inject(ModeService);
  private readonly session = inject(SessionStore);
  protected readonly names = this.session.names;
  protected readonly statusLabel = EVENT_STATUS_LABEL;
  protected readonly countdownOf = countdown;

  private readonly dashboards: Record<Mode, HttpResourceRef<Dashboard | undefined>> = {
    TUNANG: this.dashboard('TUNANG'), PERKAHWINAN: this.dashboard('PERKAHWINAN'),
  };
  private readonly notes: Record<Mode, HttpResourceRef<Note[]>> = {
    TUNANG: this.notesOf('TUNANG'), PERKAHWINAN: this.notesOf('PERKAHWINAN'),
  };

  protected readonly cards = computed(() => (['TUNANG', 'PERKAHWINAN'] as Mode[]).map(m => ({
    mode: m, slug: SLUG_OF[m], meta: MODES[m], dash: this.dashboards[m].value(),
  })));
  protected readonly pinned = computed(() => (['TUNANG', 'PERKAHWINAN'] as Mode[])
    .flatMap(m => this.notes[m].value().filter(n => n.pinned).map(n => ({ ...n, slug: SLUG_OF[m] })))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4));

  protected longDate(date: string): string {
    return formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  private dashboard(m: Mode) {
    return httpResource<Dashboard>(() => {
      const id = this.session.eventIds()[m];
      return id ? API + eventPath(id, '/dashboard') : undefined;
    });
  }

  private notesOf(m: Mode) {
    return httpResource<Note[]>(() => {
      const id = this.session.eventIds()[m];
      return id ? API + eventPath(id, '/notes') : undefined;
    }, { defaultValue: [] });
  }
}
