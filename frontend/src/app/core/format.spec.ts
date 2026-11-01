import { countdown, daysFrom, rm, senToInput, toSen, todayKL } from './format';

function addDays(days: number): string {
  const [y, m, d] = todayKL().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

describe('money', () => {
  it('formats sen as RM with two decimals', () => {
    expect(rm(125_050)).toBe('RM 1,250.50');
    expect(rm(0)).toBe('RM 0.00');
    expect(rm(-500)).toBe('−RM 5.00');
  });

  it('reads what people type without floating-point drift', () => {
    expect(toSen('1,250.50')).toBe(125_050);
    expect(toSen('RM 80')).toBe(8_000);
    expect(toSen('0.1')).toBe(10);
    expect(toSen('19.99')).toBe(1_999);
    expect(toSen('')).toBe(0);
  });

  it('rejects negative or invalid amounts', () => {
    expect(toSen('-5')).toBeNull();
    expect(toSen('abc')).toBeNull();
  });

  it('round-trips through the input format', () => {
    expect(toSen(senToInput(125_050))).toBe(125_050);
    expect(senToInput(0)).toBe('');
  });
});

describe('countdown (spec test case 8)', () => {
  it('shows nothing until a date is set', () => {
    expect(countdown(null)).toBeNull();
    expect(daysFrom(null)).toBeNull();
  });

  it('counts days ahead and handles today, tomorrow and past dates', () => {
    expect(countdown(addDays(30))).toEqual({ value: '30', unit: 'days to go', word: false });
    expect(countdown(addDays(1))?.value).toBe('Tomorrow');
    expect(countdown(addDays(0))?.value).toBe('Today');
    expect(countdown(addDays(-3))).toEqual({ value: 'Alhamdulillah', unit: '3 days ago', word: true });
  });
});
