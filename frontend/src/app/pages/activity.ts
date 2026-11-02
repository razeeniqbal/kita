import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { API } from '../core/api';
import { formatTimestamp } from '../core/format';
import { Activity, MODES, Mode } from '../core/models';
import { SessionStore } from '../core/session';
import { actorName } from '../shared/rows';

@Component({
  selector: 'k-activity',
  template: `
    <div class="ph"><div class="ph-t"><div class="eyebrow">Shared</div><h1>Activity</h1></div></div>
    @if (log.hasValue() && log.value().length) {
      <div class="list">
        @for (a of log.value(); track a.id) {
          <div class="row" [class]="'row ' + modeClass(a)">
            <div class="row-main"><span class="t"><b style="font-weight:600">{{ who(a) }}</b> {{ a.summary }}</span>
              <span class="s">{{ stamp(a.created_at) }}</span></div>
            @if (modeOf(a); as m) { <span class="row-end"><span class="pill acc">{{ label(m) }}</span></span> }
          </div>
        }
      </div>
    } @else if (log.hasValue()) { <div class="empty">No activity yet.</div> } @else { <div class="empty">Loading…</div> }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityPage {
  private readonly session = inject(SessionStore);
  protected readonly log = httpResource<Activity[]>(() => ({ url: `${API}/activity`, params: { limit: 100 } }), { defaultValue: [] });
  protected readonly stamp = formatTimestamp;

  protected who(a: Activity): string {
    return actorName(this.session, a.actor_user_id);
  }
  protected modeOf(a: Activity): Mode | null {
    return this.session.workspace()?.planning_events.find(e => e.id === a.planning_event_id)?.mode ?? null;
  }
  protected modeClass(a: Activity): string {
    const m = this.modeOf(a);
    return m ? `m-${m.toLowerCase()}` : '';
  }
  protected label(m: Mode): string {
    return MODES[m].label;
  }
}
