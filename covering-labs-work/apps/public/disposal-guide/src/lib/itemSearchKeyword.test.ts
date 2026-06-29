import { normalizeItemSearchKeyword } from './itemSearchKeyword';

describe('normalizeItemSearchKeyword', () => {
  it('trims repeated whitespace', () => {
    expect(normalizeItemSearchKeyword('  겨울   이불  ')).toBe('겨울 이불');
  });

  it('redacts email and phone values', () => {
    expect(normalizeItemSearchKeyword('소파 test@example.com 010-1234-5678')).toBe(
      '소파 [redacted_email] [redacted_phone]',
    );
  });

  it('limits the stored keyword length', () => {
    expect(normalizeItemSearchKeyword('가'.repeat(90))).toHaveLength(80);
  });
});
