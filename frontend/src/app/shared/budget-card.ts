import { ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input } from '@angular/core';
import { rm } from '../core/format';
import { BudgetSummary, Payer } from '../core/models';
import { SessionStore } from '../core/session';

/** Budget figures for one mode, with the definitions spelled out (spec 5.3). */
@Component({
  selector: 'k-budget-card',
  template: `
    @let b = summary();
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap">
      <span class="big-n">{{ rm(b.paid_sen) }}</span>
      <span class="sub" style="margin:0">{{ b.target_sen ? 'paid of ' + rm(b.target_sen) + ' target' : 'paid · no target budget set' }}</span>
    </div>
    <div class="meter" role="img" [attr.aria-label]="'Committed ' + rm(b.committed_sen) + ', paid ' + rm(b.paid_sen)">
      <i class="m-c" [style.width.%]="share(b.committed_sen)"></i><i class="m-p" [style.width.%]="share(b.paid_sen)"></i>
    </div>
    <div class="kv">
      <div><span>Target</span><b>{{ b.target_sen ? rm(b.target_sen) : 'Not set' }}</b></div>
      <div><span>Planned</span><b>{{ rm(b.planned_sen) }}</b></div>
      <div><span>Committed</span><b>{{ rm(b.committed_sen) }}</b></div>
      <div><span>Paid</span><b>{{ rm(b.paid_sen) }}</b></div>
      <div><span>Outstanding</span><b>{{ rm(b.outstanding_sen) }}</b></div>
      <div><span>Left to allocate</span>
        <b [style.color]="b.remaining_to_allocate_sen < 0 ? 'var(--danger)' : null">{{ b.target_sen ? rm(b.remaining_to_allocate_sen) : '—' }}</b></div>
    </div>
    @if (b.target_sen && b.committed_sen > b.target_sen) {
      <p class="formula" style="color:var(--danger)">Commitments are {{ rm(b.committed_sen - b.target_sen) }} over the target budget.</p>
    }
    @if (!compact()) {
      <p class="formula"><code>Left to allocate</code> = target budget − sum of planned amounts.<br>
        <code>Outstanding</code> = sum of committed amounts − sum of payments made.<br>
        <code>Committed</code> is what you have agreed to pay a vendor; <code>Planned</code> is your own allocation.</p>
      @if (payers().length) {
        <p class="formula">Paid so far by
          @for (p of payers(); track p.name; let last = $last) { <code>{{ p.name }}</code> {{ rm(p.sen) }}@if (!last) { · } }
        </p>
      }
    }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetCard {
  readonly summary = input.required<BudgetSummary>();
  readonly compact = input(false, { transform: booleanAttribute });
  private readonly names = inject(SessionStore).names;
  protected readonly rm = rm;
  protected readonly payers = computed(() =>
    Object.entries(this.summary().paid_by).map(([k, sen]) => ({ name: this.names()[k as Payer], sen: sen ?? 0 })));

  protected share(sen: number): number {
    const b = this.summary();
    const base = Math.max(b.target_sen, b.committed_sen, b.planned_sen, 1);
    return Math.min(100, (sen / base) * 100);
  }
}
