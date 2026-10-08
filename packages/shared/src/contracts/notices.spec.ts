import { noticeListQuery, toNoticeCategory } from './notices.js';

describe('toNoticeCategory', () => {
  it('keeps known keys', () => {
    expect(toNoticeCategory('agm')).toBe('agm');
  });

  it('reads empty or unknown values as general', () => {
    expect(toNoticeCategory(null)).toBe('general');
    expect(toNoticeCategory('Billing')).toBe('general');
  });
});

describe('noticeListQuery', () => {
  it('coerces paging from the query string and defaults it', () => {
    expect(noticeListQuery.parse({ page: '2' })).toEqual({ page: 2, pageSize: 20 });
  });

  it('rejects an unknown category', () => {
    expect(noticeListQuery.safeParse({ category: 'party' }).success).toBe(false);
  });
});
