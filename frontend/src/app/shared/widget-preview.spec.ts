import { TestBed } from '@angular/core/testing';
import { WIDGET_STYLES } from '../core/widget-script';
import { WidgetPreview, WidgetSummary } from './widget-preview';

const DATA: WidgetSummary = {
  events: [
    { label: 'Perkahwinan', name: 'Majlis Perkahwinan', days: null, percent: 0, paid_sen: 0, cost_sen: 0, left_to_pay_sen: 0 },
    { label: 'Tunang', name: 'Majlis Tunang', days: 63, percent: 14, paid_sen: 50000, cost_sen: 432500, left_to_pay_sen: 382500 },
  ],
  tasks: [{ title: 'Tempah dewan', overdue: true }],
};

function render(style: string, size: 'small' | 'medium'): string {
  const f = TestBed.createComponent(WidgetPreview);
  f.componentRef.setInput('data', DATA);
  f.componentRef.setInput('style', style);
  f.componentRef.setInput('size', size);
  f.detectChanges();
  return (f.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
}

describe('WidgetPreview', () => {
  it('draws every style in both sizes from the next dated milestone', () => {
    for (const { style } of WIDGET_STYLES) for (const size of ['small', 'medium'] as const) {
      expect(render(style, size)).toContain('kita.');
    }
    expect(render('countdown', 'small')).toContain('63days to go · 14% done');
    expect(render('budget', 'small')).toContain('RM 3,825left to pay');
    expect(render('tasks', 'small')).toContain('! Tempah dewan');
    expect(render('overview', 'small')).not.toContain('Next up');
    expect(render('overview', 'medium')).toContain('Next up');
  });
});
