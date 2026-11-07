import { widgetScript } from './widget-script';

describe('widgetScript', () => {
  it('embeds the key and site as safe string literals', () => {
    const code = widgetScript('abc"def', 'https://kita.example');
    expect(code).toContain('const KEY = "abc\\"def";');
    expect(code).toContain('const SITE = "https://kita.example";');
    expect(code).toContain('"X-Widget-Key": KEY');
  });
});
