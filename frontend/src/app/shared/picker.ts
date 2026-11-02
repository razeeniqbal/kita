import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { rm } from '../core/format';
import { Assignee, Category, Expense, Mode, STATUS_LABEL, TASK_SECTIONS, Task } from '../core/models';
import { Icon } from './icon';

export interface PickerItem {
  id: string;
  label: string;
  /** Section heading the item is listed under; groups keep the order items arrive in. */
  group?: string;
  /** Short secondary line, e.g. a status or an amount. */
  hint?: string;
}

/**
 * A field row that opens an in-place, grouped and searchable list. Replaces native <select> for
 * long lists (tasks, budget lines), which Windows draws as one plain right-aligned column.
 */
@Component({
  selector: 'k-picker',
  imports: [Icon],
  template: `
    <button type="button" class="field picker-field" (click)="open.set(!open())" [attr.aria-expanded]="open()"
            [attr.aria-label]="label() + ': ' + (selected()?.label ?? none())">
      <span class="lab">{{ label() }}</span>
      <span class="picker-value" [class.is-empty]="!selected()">{{ selected()?.label ?? none() }}</span>
      <k-icon name="chevron-right" [size]="16" class="picker-chev" [class.down]="open()" />
    </button>
    @if (!value() && !open() && suggestedItems().length) {
      <div class="picker-suggest">
        <span>Suggested</span>
        @for (item of suggestedItems(); track item.id) {
          <button type="button" class="chip" (click)="choose(item.id)" [attr.aria-label]="'Link ' + item.label"><k-icon name="link" [size]="13" />{{ item.label }}</button>
        }
      </div>
    }
    @if (open()) {
      <div class="picker" role="listbox" [attr.aria-label]="label()">
        @if (items().length > 6) {
          <label class="search"><k-icon name="search" [size]="16" /><span class="sr-only">Search</span>
            <input type="search" [placeholder]="'Search ' + label().toLowerCase()" [value]="query()"
                   (input)="query.set($any($event.target).value)" (keydown.enter)="$event.preventDefault()"></label>
        }
        <button type="button" class="picker-opt" role="option" [class.on]="!value()" [attr.aria-selected]="!value()" (click)="choose(null)">
          <span class="t">{{ none() }}</span>@if (!value()) { <k-icon name="check" [size]="16" /> }
        </button>
        @for (g of groups(); track g.name) {
          @if (g.name) { <div class="picker-group">{{ g.name }}</div> }
          @for (item of g.items; track item.id) {
            <button type="button" class="picker-opt" role="option" [class.on]="item.id === value()" [attr.aria-selected]="item.id === value()" (click)="choose(item.id)">
              <span class="t">{{ item.label }}@if (item.hint) { <span class="s">{{ item.hint }}</span> }</span>
              @if (item.id === value()) { <k-icon name="check" [size]="16" /> }
            </button>
          }
        } @empty {
          <div class="picker-empty">{{ items().length ? 'Nothing matches “' + query() + '”.' : emptyText() }}</div>
        }
      </div>
    }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Picker {
  readonly label = input.required<string>();
  readonly items = input<PickerItem[]>([]);
  readonly value = input<string | null>(null);
  readonly none = input('None');
  readonly emptyText = input('Nothing to choose yet.');
  /** Ids to offer as one-tap choices while nothing is linked (see suggestLinks). */
  readonly suggestions = input<string[]>([]);
  readonly changed = output<string | null>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly selected = computed(() => this.items().find(i => i.id === this.value()) ?? null);
  protected readonly suggestedItems = computed(() =>
    this.suggestions().map(id => this.items().find(i => i.id === id)).filter((i): i is PickerItem => !!i));
  protected readonly groups = computed(() => {
    const q = this.query().trim().toLowerCase();
    const groups: { name: string; items: PickerItem[] }[] = [];
    for (const item of this.items()) {
      if (q && !`${item.label} ${item.group ?? ''}`.toLowerCase().includes(q)) continue;
      const name = item.group ?? '';
      let g = groups.find(x => x.name === name);
      if (!g) groups.push(g = { name, items: [] });
      g.items.push(item);
    }
    return groups;
  });

  protected choose(id: string | null): void {
    this.changed.emit(id);
    this.open.set(false);
    this.query.set('');
  }
}

/** Checklist tasks grouped by section, in the template's section order, with status and owner. */
export function taskPickerItems(tasks: Task[], mode: Mode, names: Record<Assignee, string>): PickerItem[] {
  const sections = TASK_SECTIONS[mode];
  const sectionOf = (t: Task) => (sections.includes(t.category) ? t.category : 'Lain-lain');
  return [...tasks]
    .sort((a, b) => sections.indexOf(sectionOf(a)) - sections.indexOf(sectionOf(b)) || a.sort_order - b.sort_order)
    .map(t => ({ id: t.id, label: t.title, group: sectionOf(t), hint: `${STATUS_LABEL[t.status]} · ${names[t.assignee]}` }));
}

/** Budget lines grouped by category, in budget order, with the committed or planned amount. */
export function expensePickerItems(expenses: Expense[], categories: Category[]): PickerItem[] {
  const byId = new Map(categories.map(c => [c.id, c]));
  const order = (e: Expense) => (e.category_id ? byId.get(e.category_id)?.sort_order ?? 998 : 999);
  return [...expenses]
    .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name))
    .map(e => ({
      id: e.id, label: e.name, group: (e.category_id && byId.get(e.category_id)?.name) || 'Uncategorised',
      hint: e.committed_sen ? `${rm(e.committed_sen)} committed` : `${rm(e.planned_sen)} planned`,
    }));
}

/** Words that say nothing about what an item is. */
const FILLER = new Set(['dan', 'yang', 'jika', 'ada', 'untuk', 'atau', 'serta', 'kepada', 'dengan', 'pada', 'hantaran',
  'the', 'and', 'for', 'of']);

function words(text: string): string[] {
  return text.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
    .filter(w => w.length >= 3 && !FILLER.has(w));
}

/**
 * Up to `max` items whose label shares words with `name` (e.g. "Cincin" → "Memilih cincin
 * pertunangan…", "Hantaran: Cincin"). Whole-word matches count double; a shared start of 4+ letters
 * counts once. When nothing matches, items whose label contains any `fallback` word are offered.
 */
export function suggestLinks(name: string, items: PickerItem[], { max = 2, fallback = [] as string[] } = {}): string[] {
  const wanted = words(name);
  const scored = wanted.length ? items.map(item => {
    const have = words(item.label);
    let score = 0;
    for (const w of wanted) {
      if (have.includes(w)) score += 2;
      else if (w.length >= 4 && have.some(h => h.length >= 4 && h.slice(0, 4) === w.slice(0, 4))) score += 1;
    }
    return { id: item.id, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score) : [];
  if (scored.length) return scored.slice(0, max).map(s => s.id);
  const lower = fallback.map(f => f.toLowerCase());
  return items.filter(i => lower.some(f => i.label.toLowerCase().includes(f))).slice(0, max).map(i => i.id);
}
