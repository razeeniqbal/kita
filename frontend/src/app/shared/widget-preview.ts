import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Mode } from '../core/models';
import { WidgetStyle } from '../core/widget-script';
import { Icon } from './icon';

export interface WidgetSummary {
  events: { mode: Mode; label: string; name: string; days: number | null; percent: number; paid_sen: number;
            cost_sen: number; left_to_pay_sen: number }[];
  tasks: { title: string; overdue: boolean }[];
}

/** How a widget style looks on the Home Screen. Mirrors the layouts in core/widget-script.ts. */
@Component({
  selector: 'k-widget-preview',
  imports: [NgTemplateOutlet, Icon],
  template: `
    @let e = event();
    <div class="wp" [class.wide]="size() === 'medium'" [class.sage]="e?.mode === 'PERKAHWINAN'" aria-hidden="true">
      <div class="wp-top"><k-icon name="heart" [size]="11" /><b>kita.</b>@if (e) { <span>{{ e.label }}</span> }</div>
      @if (e) {
        @switch (layout()) {
          @case ('countdown') { <div class="wp-col"><ng-container *ngTemplateOutlet="cd; context: { $implicit: e, big: size() === 'medium' }" /></div> }
          @case ('tasks') { <div class="wp-col"><ng-container *ngTemplateOutlet="list; context: { $implicit: size() === 'small' ? 3 : 4 }" /></div> }
          @case ('budget') {
            <div class="wp-col">
              <span class="wp-s">Left to pay</span>
              <span class="wp-num" [class.mid]="size() === 'medium'">{{ rm(e.left_to_pay_sen) }}</span>
              <span class="wp-bar"><i [style.width.%]="e.cost_sen ? (100 * e.paid_sen) / e.cost_sen : 0"></i></span>
              <span class="wp-xs">{{ rm(e.paid_sen) }} of {{ rm(e.cost_sen) }} paid</span>
            </div>
          }
          @case ('split') {
            <div class="wp-row"><div class="wp-col"><ng-container *ngTemplateOutlet="cd; context: { $implicit: e, big: false }" /></div>
              <div class="wp-col"><ng-container *ngTemplateOutlet="list; context: { $implicit: 4 }" /></div></div>
          }
        }
      } @else { <span class="wp-s">Nothing planned yet.</span> }
    </div>

    <ng-template #cd let-e let-big="big">
      <span class="wp-s">{{ e.name }}</span>
      @if (e.days === null) { <span class="wp-num small">Date not set</span> }
      @else {
        <span class="wp-days"><b class="wp-num" [class.big]="big">{{ e.days === 0 ? 'Today!' : e.days }}</b>
          @if (e.days) { <small>{{ e.days === 1 ? 'day' : 'days' }}<br>to go</small> }</span>
        <span class="wp-bar"><i [style.width.%]="e.percent"></i></span>
        <span class="wp-xs">{{ e.percent }}% of tasks done</span>
      }
    </ng-template>
    <ng-template #list let-count>
      <span class="wp-s">Next up</span>
      @for (t of data().tasks.slice(0, count); track $index) {
        <span class="wp-t" [class.late]="t.overdue"><i></i>{{ t.title }}</span>
      } @empty { <span class="wp-t done">Nothing due. Nice.</span> }
    </ng-template>`,
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
