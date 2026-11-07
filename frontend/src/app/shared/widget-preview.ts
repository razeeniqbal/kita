import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { WidgetStyle } from '../core/widget-script';

export interface WidgetSummary {
  events: { label: string; name: string; days: number | null; percent: number; paid_sen: number; cost_sen: number;
            left_to_pay_sen: number }[];
  tasks: { title: string; overdue: boolean }[];
}

/** How a widget style looks on the Home Screen. Mirrors the layouts in core/widget-script.ts. */
@Component({
  selector: 'k-widget-preview',
  template: `
    <div class="wp" [class.wide]="size() === 'medium'" aria-hidden="true">
      <b class="wp-brand">kita.</b>
      @if (event(); as e) {
        @switch (layout()) {
          @case ('countdown') { <ng-container *ngTemplateOutlet="cd; context: { $implicit: e }" /> }
          @case ('tasks') { <ng-container *ngTemplateOutlet="list; context: { $implicit: size() === 'small' ? 3 : 4 }" /> }
          @case ('budget') {
            <span class="wp-s">{{ e.label }} budget</span>
            <span class="wp-mid">{{ rm(e.left_to_pay_sen) }}</span>
            <span class="wp-s">left to pay</span>
            <span class="wp-s wp-gap">{{ rm(e.paid_sen) }} paid of {{ rm(e.cost_sen) }}</span>
          }
          @case ('split') {
            <div class="wp-row"><div><ng-container *ngTemplateOutlet="cd; context: { $implicit: e }" /></div>
              <div><ng-container *ngTemplateOutlet="list; context: { $implicit: 4 }" /></div></div>
          }
        }
      } @else { <span class="wp-s">Nothing planned yet.</span> }
    </div>

    <ng-template #cd let-e>
      <span class="wp-s">{{ e.label }} · {{ e.name }}</span>
      @if (e.days === null) { <span class="wp-mid">Date not set</span> }
      @else if (e.days === 0) { <span class="wp-big">Today!</span> }
      @else {
        <span class="wp-big" [class.huge]="size() === 'medium' && layout() === 'countdown'">{{ e.days }}</span>
        <span class="wp-s">{{ e.days === 1 ? 'day' : 'days' }} to go · {{ e.percent }}% done</span>
      }
    </ng-template>
    <ng-template #list let-count>
      <span class="wp-s wp-head">Next up</span>
      @for (t of data().tasks.slice(0, count); track $index) {
        <span class="wp-t" [class.late]="t.overdue">{{ t.overdue ? '! ' : '• ' }}{{ t.title }}</span>
      } @empty { <span class="wp-s">Nothing due. Nice.</span> }
    </ng-template>`,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WidgetPreview {
  readonly data = input.required<WidgetSummary>();
  readonly style = input.required<WidgetStyle>();
  readonly size = input<'small' | 'medium'>('small');

  protected readonly event = computed(() => {
    const events = this.data().events;
    return events.find(e => e.days !== null && e.days >= 0) ?? events[0] ?? null;
  });
  protected readonly layout = computed(() =>
    this.style() === 'overview' ? (this.size() === 'small' ? 'countdown' : 'split') : this.style());
  protected rm(sen: number): string {
    return 'RM ' + Math.round(sen / 100).toLocaleString('en-MY');
  }
}
