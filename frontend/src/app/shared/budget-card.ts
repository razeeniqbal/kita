import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { rm } from '../core/format';
import { BudgetSummary } from '../core/models';

/** How much is paid out of the total cost, and how that sits against the budget if one is set. */
@Component({
  selector: 'k-budget-card',
  template: `
    @let b = summary();
    <div class="bud-n"><span class="big-n">{{ rm(b.paid_sen) }}</span><span>paid of {{ rm(b.cost_sen) }}</span></div>
    <div class="meter" role="img" [attr.aria-label]="rm(b.paid_sen) + ' paid of ' + rm(b.cost_sen)">
      <i class="m-p" [style.width.%]="paidShare()"></i>
    </div>
    <div class="bud-foot">
      <span>{{ b.left_to_pay_sen ? rm(b.left_to_pay_sen) + ' left to pay' : b.cost_sen ? 'All paid' : 'No costs yet' }}</span>
      @if (b.target_sen) {
        <span [class.over]="b.cost_sen > b.target_sen">{{ b.cost_sen > b.target_sen
          ? rm(b.cost_sen - b.target_sen) + ' over budget' : rm(b.target_sen - b.cost_sen) + ' under budget' }}</span>
      }
    </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetCard {
  readonly summary = input.required<BudgetSummary>();
  protected readonly rm = rm;
  protected readonly paidShare = computed(() => {
    const b = this.summary();
    return b.cost_sen ? Math.min(100, (b.paid_sen / b.cost_sen) * 100) : 0;
  });
}
