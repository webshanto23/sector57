import { documentPeriod, formatDocumentNo } from '../fiscal.js';
import { toNFC } from '../text.js';
import {
  CERTIFICATE_TYPES,
  DEFAULT_CERTIFICATE_TEMPLATES,
  certificateCreateSchema,
  certificateTemplatesInputSchema,
  certificateTemplatesOf,
  duesDecision,
  renderCertificate,
  tiedForCertificate,
  unitText,
  unknownPlaceholders,
} from './certificates.js';

describe('certificate numbers', () => {
  it('restart each fiscal year', () => {
    expect(formatDocumentNo('certificate', documentPeriod('certificate', '2026-10-24', 7), 7)).toBe('CRT-26-0007');
    expect(formatDocumentNo('certificate', documentPeriod('certificate', '2026-06-30', 7), 7)).toBe('CRT-25-0007');
    expect(formatDocumentNo('certificate', '26', 12345)).toBe('CRT-26-12345');
  });
});

describe('renderCertificate', () => {
  it('fills known placeholders and leaves unknown braces alone', () => {
    expect(renderCertificate('{name} at {unit}, {other}', { name: 'রহিম', unit: 'বাড়ি ১২' })).toBe('রহিম at বাড়ি ১২, {other}');
  });

  it('prints nothing for a missing value', () => {
    expect(renderCertificate('[{memberNo}]', { memberNo: null })).toBe('[]');
    expect(renderCertificate('[{purpose}]', {})).toBe('[]');
  });

  it('fills every placeholder each time it appears', () => {
    expect(renderCertificate('{name} {name}', { name: 'A' })).toBe('A A');
  });
});

describe('templates', () => {
  it('defaults name only known placeholders and are NFC', () => {
    for (const type of CERTIFICATE_TYPES) {
      for (const lang of ['bn', 'en'] as const) {
        const template = DEFAULT_CERTIFICATE_TEMPLATES[type][lang];
        expect(unknownPlaceholders(template)).toEqual([]);
        expect(toNFC(template)).toBe(template);
      }
    }
  });

  it('refuses unknown placeholders and empty text', () => {
    const bad = certificateTemplatesInputSchema.safeParse({ residence: { bn: '{নাম} {nme}', en: 'ok' } });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((issue) => issue.message)).toContain('unknown_placeholder');
    expect(certificateTemplatesInputSchema.safeParse({ residence: { bn: '  ', en: 'x' } }).success).toBe(false);
    expect(certificateTemplatesInputSchema.safeParse({ unknown_type: { bn: 'x', en: 'x' } }).success).toBe(false);
  });

  it('keeps line breaks and turns CRLF into LF', () => {
    const parsed = certificateTemplatesInputSchema.parse({ residence: { bn: ' এক\r\nদুই ', en: 'one\rtwo' } });
    expect(parsed.residence).toEqual({ bn: 'এক\nদুই', en: 'one\ntwo' });
  });

  it('fall back per type to the default when the saved one is missing or broken', () => {
    const saved = { residence: { bn: 'নিজের {name}', en: 'Own {name}' }, noc_sale: { bn: '' }, junk: 1 };
    const templates = certificateTemplatesOf(saved);
    expect(templates.residence).toEqual({ bn: 'নিজের {name}', en: 'Own {name}' });
    expect(templates.noc_sale).toEqual(DEFAULT_CERTIFICATE_TEMPLATES.noc_sale);
    expect(certificateTemplatesOf(null)).toEqual(DEFAULT_CERTIFICATE_TEMPLATES);
  });
});

describe('duesDecision', () => {
  it('is clear when nothing is owed', () => {
    expect(duesDecision('noc_sale', '0.00', false)).toBe('clear');
    expect(duesDecision('no_dues', '0', false)).toBe('clear');
  });

  it('never issues a no-dues certificate while anything is owed', () => {
    expect(duesDecision('no_dues', '0.01', true)).toBe('blocked');
  });

  it('asks for allowDues on other types', () => {
    expect(duesDecision('noc_rent', '2500.00', false)).toBe('needs_allow');
    expect(duesDecision('noc_rent', '2500.00', true)).toBe('allowed');
  });
});

describe('ties', () => {
  it('lets only owners sell, let or borrow', () => {
    expect(tiedForCertificate('noc_sale', ['renter', 'resident'])).toBe(false);
    expect(tiedForCertificate('noc_sale', ['owner'])).toBe(true);
    expect(tiedForCertificate('noc_utility', ['renter'])).toBe(true);
    expect(tiedForCertificate('residence', ['resident'])).toBe(true);
    expect(tiedForCertificate('no_dues', [])).toBe(false);
  });
});

describe('certificateCreateSchema', () => {
  it('writes in Bangla by default and cleans the text', () => {
    const parsed = certificateCreateSchema.parse({
      type: 'noc_loan',
      personId: '6f1c1f4e-1d6a-4a43-9c32-5a1d2b3c4d5e',
      unitId: '7a2d2f5f-2e7b-4b54-8d43-6b2e3c4d5e6f',
      addressee: '  ব্যবস্থাপক, ক ব্যাংক ',
    });
    expect(parsed.lang).toBe('bn');
    expect(parsed.addressee).toBe('ব্যবস্থাপক, ক ব্যাংক');
    expect(parsed.purpose).toBeNull();
  });
});

describe('unitText', () => {
  it('names the unit, then the places above it, nearest first', () => {
    expect(unitText({ name: 'এ-৩', address: ['ব্লক সি', 'রোড ৪', 'বাড়ি ১২'] })).toBe('এ-৩, বাড়ি ১২, রোড ৪, ব্লক সি');
    expect(unitText({ name: 'A-3', address: [] })).toBe('A-3');
  });
});
