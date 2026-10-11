import type { Locale } from './locale.js';
import { toPaisa } from './money.js';

// Bangla has a separate word for every number below 100.
// prettier-ignore
const BN_0_99 = [
  'শূন্য', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়',
  'দশ', 'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ',
  'বিশ', 'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আটাশ', 'ঊনত্রিশ',
  'ত্রিশ', 'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাঁইত্রিশ', 'আটত্রিশ', 'ঊনচল্লিশ',
  'চল্লিশ', 'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'ঊনপঞ্চাশ',
  'পঞ্চাশ', 'একান্ন', 'বায়ান্ন', 'তিপ্পান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপ্পান্ন', 'সাতান্ন', 'আটান্ন', 'ঊনষাট',
  'ষাট', 'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'ঊনসত্তর',
  'সত্তর', 'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'ঊনআশি',
  'আশি', 'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'অষ্টাশি', 'ঊননব্বই',
  'নব্বই', 'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই',
].map((word) => word.normalize('NFC'));

// prettier-ignore
const EN_0_19 = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

type Scale = { below100: (n: number) => string; hundred: (n: number) => string; thousand: string; lakh: string; crore: string };

const SCALES: Record<Locale, Scale> = {
  // Hundreds join the digit word: পাঁচশত.
  bn: { below100: (n) => BN_0_99[n]!, hundred: (n) => `${BN_0_99[n]}শত`, thousand: 'হাজার', lakh: 'লক্ষ', crore: 'কোটি' },
  en: {
    below100: (n) => (n < 20 ? EN_0_19[n]! : EN_TENS[Math.floor(n / 10)]! + (n % 10 ? `-${EN_0_19[n % 10]}` : '')),
    hundred: (n) => `${EN_0_19[n]} hundred`,
    thousand: 'thousand',
    lakh: 'lakh',
    crore: 'crore',
  },
};

/** A whole number in words with the South Asian grouping: crore, lakh, thousand, hundred. */
function integerWords(n: bigint, scale: Scale): string {
  if (n >= 10_000_000n) {
    // Crore counts above 99 are themselves read with lakh and thousand: এক হাজার কোটি.
    const rest = n % 10_000_000n;
    return [integerWords(n / 10_000_000n, scale), scale.crore, rest ? integerWords(rest, scale) : ''].filter(Boolean).join(' ');
  }
  const value = Number(n);
  const parts: string[] = [];
  const lakh = Math.floor(value / 100_000);
  const thousand = Math.floor((value % 100_000) / 1000);
  const hundred = Math.floor((value % 1000) / 100);
  const below100 = value % 100;
  if (lakh) parts.push(scale.below100(lakh), scale.lakh);
  if (thousand) parts.push(scale.below100(thousand), scale.thousand);
  if (hundred) parts.push(scale.hundred(hundred));
  if (below100 || parts.length === 0) parts.push(scale.below100(below100));
  return parts.join(' ');
}

/**
 * The amount as written on a receipt:
 * bn `চার হাজার পাঁচশত টাকা পঞ্চাশ পয়সা মাত্র`, en `Taka four thousand five hundred and fifty paisa only`.
 * Takes the decimal string (never a float); negative amounts are refused.
 */
export function amountInWords(amount: string, locale: Locale): string {
  const paisa = toPaisa(amount);
  if (paisa < 0n) throw new RangeError(`Negative amount: ${amount}`);
  const scale = SCALES[locale];
  const taka = integerWords(paisa / 100n, scale);
  const rest = Number(paisa % 100n);
  if (locale === 'bn') {
    return rest ? `${taka} টাকা ${scale.below100(rest)} পয়সা মাত্র` : `${taka} টাকা মাত্র`;
  }
  return rest ? `Taka ${taka} and ${scale.below100(rest)} paisa only` : `Taka ${taka} only`;
}
