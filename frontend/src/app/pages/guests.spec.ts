import { whatsappNumber } from './guests';

describe('whatsappNumber', () => {
  it('turns a Malaysian phone into a WhatsApp number, and ignores anything else', () => {
    expect(whatsappNumber('012-345 6789')).toBe('60123456789');
    expect(whatsappNumber('+60 12 345 6789')).toBe('60123456789');
    expect(whatsappNumber('@maklong (Instagram)')).toBe('');
    expect(whatsappNumber('')).toBe('');
  });
});
