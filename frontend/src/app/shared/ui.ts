import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Art, ArtName } from './art';
import { Icon, IconName } from './icon';

/** Bottom sheet on phones, centred dialog on desktop. Escape or the backdrop closes it. */
@Component({
  selector: 'k-sheet',
  template: `
    <div class="scrim" [class.open]="open()" (click)="closed.emit()"></div>
    <div class="sheet" [class.open]="open()" role="dialog" aria-modal="true" [attr.aria-label]="title()"
         [attr.inert]="open() ? null : ''" (keydown.escape)="closed.emit()">
      <div class="sheet-bar">
        <button type="button" class="l" (click)="closed.emit()">Cancel</button>
        <h2>{{ title() }}</h2>
        <ng-content select="[sheetAction]" />
      </div>
      @if (open()) { <ng-content /> }
    </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sheet {
  readonly open = input(false);
  readonly title = input('');
  readonly closed = output<void>();
}

/** Empty section with its approved illustration (spec 16.2: art mainly in empty states). */
@Component({
  selector: 'k-empty',
  imports: [Art, Icon],
  template: `
    <div class="empty art-empty">
      @if (art() === 'calendar') {
        <picture>
          <source media="(max-width: 899px)" srcset="/assets/kita/calendar-icon-illustration-480.webp">
          <img class="art" src="/assets/kita/calendar-editorial-960.webp" width="480" height="480" alt="" loading="lazy" decoding="async">
        </picture>
      } @else {
        <k-art [name]="artName()" sizes="(max-width: 899px) 170px, 240px" />
      }
      <div>
        <b>{{ title() }}</b>
        <p>{{ text() }}</p>
        @if (action()) {
          <button type="button" class="btn sm" (click)="act.emit()"><k-icon name="plus" [size]="18" />{{ action() }}</button>
        }
      </div>
    </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly art = input.required<ArtName | 'calendar'>();
  readonly title = input.required<string>();
  readonly text = input('');
  readonly action = input('');
  readonly act = output<void>();
  protected readonly artName = computed(() => this.art() as ArtName);
}

/** Progress ring for the overview. */
@Component({
  selector: 'k-ring',
  template: `
    <svg class="ring" viewBox="0 0 96 96" [attr.width]="size()" [attr.height]="size()" role="img" [attr.aria-label]="percent() + ' percent complete'">
      <circle cx="48" cy="48" r="38" class="ring-trk" />
      <circle cx="48" cy="48" r="38" class="ring-arc" [attr.stroke-dasharray]="circumference"
              [attr.stroke-dashoffset]="circumference * (1 - percent() / 100)" transform="rotate(-90 48 48)" />
      <text x="48" y="49" class="ring-t" text-anchor="middle" dominant-baseline="middle">{{ percent() }}%</text>
    </svg>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Ring {
  readonly percent = input(0);
  readonly size = input(96);
  protected readonly circumference = 2 * Math.PI * 38;
}

/** Notice banner. */
@Component({
  selector: 'k-notice',
  imports: [Icon],
  template: `<div class="notice"><k-icon [name]="icon()" [size]="18" /><div><ng-content /></div></div>`,
  styles: ':host{display:block}',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Notice {
  readonly icon = input<IconName>('eye');
}
