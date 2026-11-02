import { TestBed } from '@angular/core/testing';
import { Task } from '../core/models';
import { Picker, PickerItem, suggestLinks, taskPickerItems } from './picker';

const ITEMS: PickerItem[] = [
  { id: 'p1', label: 'Berbincang tentang tarikh pertunangan yang sesuai.', group: 'Perbincangan & keluarga', hint: 'Done · Both' },
  { id: 'p2', label: 'Berbincang dengan keluarga kedua-dua belah pihak.', group: 'Perbincangan & keluarga' },
  { id: 'c1', label: 'Memilih cincin pertunangan dan mengesahkan saiz.', group: 'Cincin & hantaran' },
  { id: 'c2', label: 'Menyediakan senarai barang hantaran.', group: 'Cincin & hantaran' },
  { id: 'c3', label: 'Menentukan dekorasi dan gubahan hantaran.', group: 'Cincin & hantaran' },
  { id: 's1', label: 'Memilih lokasi majlis pertunangan.', group: 'Persiapan majlis' },
  { id: 's2', label: 'Mengurus makanan atau katering.', group: 'Persiapan majlis' },
];

function render(value: string | null) {
  const fixture = TestBed.createComponent(Picker);
  fixture.componentRef.setInput('label', 'Checklist task');
  fixture.componentRef.setInput('items', ITEMS);
  fixture.componentRef.setInput('value', value);
  const chosen: (string | null)[] = [];
  fixture.componentInstance.changed.subscribe(v => chosen.push(v));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const open = () => { el.querySelector<HTMLButtonElement>('.picker-field')!.click(); fixture.detectChanges(); };
  return { fixture, el, chosen, open };
}

describe('Picker', () => {
  it('shows the current choice, or None', () => {
    expect(render('c2').el.querySelector('.picker-value')!.textContent).toContain('Menyediakan senarai barang hantaran.');
    expect(render(null).el.querySelector('.picker-value')!.textContent).toContain('None');
  });

  it('opens a list grouped by section, with the current choice marked', () => {
    const { el, open } = render('c2');
    open();
    const groups = [...el.querySelectorAll('.picker-group')].map(g => g.textContent?.trim());
    expect(groups).toEqual(['Perbincangan & keluarga', 'Cincin & hantaran', 'Persiapan majlis']);
    expect(el.querySelector('.picker-opt.on')!.textContent).toContain('Menyediakan senarai barang hantaran.');
    expect(el.querySelector('.picker-opt .s')!.textContent).toContain('Done · Both');
  });

  it('filters as you type and says when nothing matches', () => {
    const { fixture, el, open } = render(null);
    open();
    const search = el.querySelector<HTMLInputElement>('.picker input[type=search]')!;
    search.value = 'katering';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const labels = () => [...el.querySelectorAll('.picker-opt .t')].map(o => o.textContent?.trim()).filter(t => t !== 'None');
    expect(labels()).toEqual(['Mengurus makanan atau katering.']);
    // A section name finds the whole section.
    search.value = 'cincin & hantaran';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(labels()).toHaveLength(3);
    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.querySelector('.picker-empty')!.textContent).toContain('Nothing matches');
  });

  it('emits the chosen id, or null for None, and closes', () => {
    const { fixture, el, chosen, open } = render('c2');
    open();
    [...el.querySelectorAll<HTMLButtonElement>('.picker-opt')].find(o => o.textContent?.includes('katering'))!.click();
    fixture.detectChanges();
    expect(chosen).toEqual(['s2']);
    expect(el.querySelector('.picker')).toBeNull();
    open();
    el.querySelector<HTMLButtonElement>('.picker-opt')!.click();
    expect(chosen).toEqual(['s2', null]);
  });
});

describe('taskPickerItems', () => {
  it('orders tasks by checklist section, then by their own order', () => {
    const task = (id: string, category: string, sort_order: number) => ({
      id, title: id, category, sort_order, status: 'NOT_STARTED', assignee: 'BOTH',
    }) as Task;
    const items = taskPickerItems(
      [task('late', 'Semakan akhir', 1), task('ring', 'Cincin & hantaran', 2), task('talk', 'Perbincangan & keluarga', 1), task('misc', 'Something else', 1)],
      'TUNANG', { PARTNER_1: 'Razeen', PARTNER_2: 'Sabrina', BOTH: 'Both', UNASSIGNED: 'Unassigned' },
    );
    expect(items.map(i => [i.id, i.group])).toEqual([
      ['talk', 'Perbincangan & keluarga'], ['ring', 'Cincin & hantaran'], ['late', 'Semakan akhir'], ['misc', 'Lain-lain'],
    ]);
    expect(items[0].hint).toBe('Not started · Both');
  });
});

describe('suggestLinks', () => {
  it('matches the item name against task and budget wording', () => {
    expect(suggestLinks('Cincin', ITEMS)).toEqual(['c1']);
    expect(suggestLinks('Cincin', [{ id: 'e1', label: 'Hantaran: Cincin' }, { id: 'e2', label: 'Hantaran: Kasut' }])).toEqual(['e1']);
  });

  it('ignores filler words, and falls back to general tasks when nothing matches', () => {
    expect(suggestLinks('Hantaran dan', ITEMS)).toEqual([]);
    expect(suggestLinks('Telekung', ITEMS, { fallback: ['hantaran'] })).toEqual(['c2', 'c3']);
    expect(suggestLinks('', ITEMS, { fallback: ['hantaran'], max: 1 })).toEqual(['c2']);
  });
});

describe('Picker suggestions', () => {
  it('offers suggested items as chips while empty, and links on tap', () => {
    const { fixture, el, chosen } = render(null);
    fixture.componentRef.setInput('suggestions', ['c1', 'missing']);
    fixture.detectChanges();
    const chips = el.querySelectorAll<HTMLButtonElement>('.picker-suggest .chip');
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toContain('Memilih cincin');
    chips[0].click();
    expect(chosen).toEqual(['c1']);
  });

  it('hides suggestions once something is linked', () => {
    const { fixture, el } = render('s1');
    fixture.componentRef.setInput('suggestions', ['c1']);
    fixture.detectChanges();
    expect(el.querySelector('.picker-suggest')).toBeNull();
    expect(el.querySelector('.picker-value')!.classList.contains('empty')).toBe(false);
  });
});
