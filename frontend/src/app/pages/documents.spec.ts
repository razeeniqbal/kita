import { guessKind } from './documents';

describe('guessKind', () => {
  it('guesses the document type from its file name', () => {
    expect(guessKind('Resit deposit dewan')).toBe('RECEIPT');
    expect(guessKind('Sebut harga katering')).toBe('QUOTATION');
    expect(guessKind('Perjanjian butik')).toBe('AGREEMENT');
    expect(guessKind('IMG_2041')).toBe('OTHER');
  });
});
