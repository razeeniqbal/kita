import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';

/** Approved artwork (spec section 16): WebP at 480w and 960w in public/assets/kita. Aspect ratios keep layout stable. */
const ART = {
  'brand-heart': [1, 1], 'brand-heart-dark': [1, 1], 'botanical-border': [3, 1], 'journey-ribbons': [1, 1],
  'tunang-cover': [3, 2], 'perkahwinan-cover': [3, 2], 'checklist-papers': [1, 1], 'budget-jar': [1, 1],
  'calendar-editorial': [1, 1], 'calendar-icon-illustration': [1, 1], 'guests-envelopes': [1, 1],
  'documents-stationery': [1, 1], 'notes-cards': [16, 9],
} as const;
export type ArtName = keyof typeof ART;

/** Decorative image (empty alt): the headings next to it already say what it means. */
@Component({
  selector: 'k-art',
  template: `<img [class]="cls()" [src]="base() + '-960.webp'" [attr.srcset]="base() + '-480.webp 480w, ' + base() + '-960.webp 960w'"
    [attr.sizes]="sizes()" [width]="width()" [height]="height()" alt="" [attr.loading]="eager() ? null : 'lazy'"
    [attr.fetchpriority]="eager() ? 'high' : null" decoding="async">`,
  styles: ':host{display:contents}',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Art {
  readonly name = input.required<ArtName>();
  readonly cls = input('art');
  readonly sizes = input('(max-width: 899px) 90vw, 480px');
  readonly eager = input(false, { transform: booleanAttribute });
  protected readonly base = computed(() => `/assets/kita/${this.name()}`);
  protected readonly width = computed(() => ART[this.name()][0] * 480);
  protected readonly height = computed(() => ART[this.name()][1] * 480);
}

/** The heart emblem in both colourways; CSS shows the one that suits the theme. */
@Component({
  selector: 'k-emblem',
  imports: [Art],
  template: `<k-art name="brand-heart" cls="emblem" [sizes]="size() + 'px'" eager />
    <k-art name="brand-heart-dark" cls="emblem dk" [sizes]="size() + 'px'" eager />`,
  styles: ':host{display:contents}',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Emblem {
  readonly size = input(28);
}
