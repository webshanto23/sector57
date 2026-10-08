/** Unicode NFC, so the same Bangla word always has the same bytes (search, uniqueness). */
export function toNFC(value: string): string {
  return value.normalize('NFC');
}

/** NFC plus trim: what every user-typed string goes through before it is saved. */
export function cleanText(value: string): string {
  return toNFC(value).trim();
}

/** Applies `cleanText` to every string inside plain objects and arrays. */
export function cleanDeep<T>(value: T): T {
  if (typeof value === 'string') return cleanText(value) as T;
  if (Array.isArray(value)) return value.map((item) => cleanDeep(item)) as T;
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cleanDeep(item)]),
    ) as T;
  }
  return value;
}

const HONORIFIC = /^(মোঃ|মো\.|Md\.?|Dr\.|ডা\.)\s*/u;

/** Avatar initials, as in the mockup: one Bangla letter, or up to two Latin initials. */
export function initials(name: string): string {
  const words = cleanText(name).replace(HONORIFIC, '').split(/\s+/u).filter(Boolean);
  if (words.length === 0) return '';
  const first = (word: string) => {
    const segment = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word);
    return segment[Symbol.iterator]().next().value?.segment ?? '';
  };
  if (/^\p{Script=Bengali}/u.test(words[0]!)) return first(words[0]!);
  return words.slice(0, 2).map(first).join('').toUpperCase();
}
