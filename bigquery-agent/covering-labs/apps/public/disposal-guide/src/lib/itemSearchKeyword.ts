export const MAX_ITEM_SEARCH_KEYWORD_LENGTH = 80;

export function normalizeItemSearchKeyword(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[redacted_email]')
    .replace(/(?:\+?82[-.\s]?)?0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, '[redacted_phone]')
    .slice(0, MAX_ITEM_SEARCH_KEYWORD_LENGTH);
}
