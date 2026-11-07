import { WIDGET_STYLES, widgetScript } from './widget-script';

describe('widgetScript', () => {
  it('embeds the key and site as safe string literals', () => {
    const code = widgetScript('abc"def', 'https://kita.example');
    expect(code).toContain('const KEY = "abc\\"def";');
    expect(code).toContain('const SITE = "https://kita.example";');
    expect(code).toContain('"X-Widget-Key": KEY');
  });
});

describe('widgetScript styles', () => {
  it('handles every style offered in Settings', () => {
    const code = widgetScript('k', 'https://kita.example');
    for (const { style } of WIDGET_STYLES.filter(s => s.style !== 'overview')) expect(code).toContain(`STYLE === "${style}"`);
  });
});

describe('widgetScript per style', () => {
  it('bakes in the chosen style, still overridable by a widget Parameter', () => {
    expect(widgetScript('k', 'https://kita.example', 'budget')).toContain('String(args.widgetParameter || "budget")');
    expect(widgetScript('k', 'https://kita.example')).toContain('String(args.widgetParameter || "overview")');
  });
});
