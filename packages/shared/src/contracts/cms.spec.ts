import { committeeSeatCreateSchema, committeeSeatUpdateSchema } from './committee.js';
import { albumInputSchema, photoCaptionSchema, photoOrderSchema } from './gallery.js';
import { noticeInputSchema, noticeStatus } from './notices.js';
import { EDITABLE_PAGES, pageContentSchemas } from './site-pages.js';

describe('noticeStatus', () => {
  const now = new Date('2026-10-10T10:00:00Z');

  it('reads internal, scheduled and published from the flags', () => {
    expect(noticeStatus({ isPublic: false, publishAt: '2026-01-01T00:00:00Z' }, now)).toBe('internal');
    expect(noticeStatus({ isPublic: true, publishAt: '2026-10-11T00:00:00Z' }, now)).toBe('scheduled');
    expect(noticeStatus({ isPublic: true, publishAt: '2026-10-10T10:00:00Z' }, now)).toBe('published');
  });
});

describe('noticeInputSchema', () => {
  const base = {
    titleBn: '  নোটিশ  ',
    bodyBn: 'লাইন এক\r\nলাইন দুই',
    category: 'agm',
    isPublic: true,
    publishAt: '2026-10-10T16:00:00+06:00',
  };

  it('trims, normalises line breaks and turns blank English into null', () => {
    const parsed = noticeInputSchema.parse({ ...base, titleEn: ' ', bodyEn: '' });
    expect(parsed).toMatchObject({ titleBn: 'নোটিশ', bodyBn: 'লাইন এক\nলাইন দুই', titleEn: null, bodyEn: null });
  });

  it('needs a Bangla title and body, a known category and an instant with offset', () => {
    expect(noticeInputSchema.safeParse({ ...base, titleBn: ' ' }).success).toBe(false);
    expect(noticeInputSchema.safeParse({ ...base, bodyBn: '' }).success).toBe(false);
    expect(noticeInputSchema.safeParse({ ...base, category: 'party' }).success).toBe(false);
    expect(noticeInputSchema.safeParse({ ...base, publishAt: '2026-10-10T16:00' }).success).toBe(false);
  });
});

describe('committee seat schemas', () => {
  const seat = { nameBn: 'রহিম', position: 'treasurer', sortOrder: '2', termStart: '2026-01-01', termEnd: '' };

  it('accepts an open-ended term and a blank phone', () => {
    expect(committeeSeatCreateSchema.parse({ ...seat, termEnd: null, phone: ' ' })).toMatchObject({
      sortOrder: 2,
      termEnd: null,
      phone: null,
      nameEn: null,
    });
  });

  it('normalises a Bangla-digit phone', () => {
    expect(committeeSeatCreateSchema.parse({ ...seat, termEnd: null, phone: '০১৭১১-০০০০০০' }).phone).toBe('01711000000');
  });

  it('rejects a term that ends before it starts', () => {
    const result = committeeSeatUpdateSchema.safeParse({ ...seat, termEnd: '2025-12-31' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ['termEnd'], message: 'term_end_before_start' });
  });
});

describe('gallery schemas', () => {
  it('reads a missing event date as null', () => {
    expect(albumInputSchema.parse({ titleBn: 'বৈশাখ', isPublished: false })).toMatchObject({ eventDate: null, titleEn: null });
  });

  it('turns blank captions into null', () => {
    expect(photoCaptionSchema.parse({ captionBn: ' ', captionEn: undefined })).toEqual({ captionBn: null, captionEn: null });
  });

  it('only takes photo ids', () => {
    expect(photoOrderSchema.safeParse({ photoIds: ['x'] }).success).toBe(false);
  });
});

describe('pageContentSchemas', () => {
  it('has a schema for every editable page', () => {
    expect(Object.keys(pageContentSchemas).sort()).toEqual([...EDITABLE_PAGES].sort());
  });
});
