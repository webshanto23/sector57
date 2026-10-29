import { MAX_LICENCE_PAGES } from '@s57/shared';
import { hasLicenceRoom, isPdf, nidCopiesOf, toIdCopy, type IdCopyRow } from './id-copies.policy.js';

const row = (id: string, doc_type: string, at: string, file_url = `s/documents/${id}.webp`): IdCopyRow => ({
  id,
  doc_type,
  file_url,
  uploaded_at: new Date(at),
});

describe('id copies policy', () => {
  it('picks the newest copy of each NID side', () => {
    const copies = nidCopiesOf([
      row('a', 'nid_front', '2026-10-01T00:00:00Z'),
      row('b', 'nid_front', '2026-10-02T00:00:00Z'),
      row('c', 'trade_licence', '2026-10-03T00:00:00Z'),
    ]);
    expect(copies.front?.id).toBe('b');
    expect(copies.back).toBeNull();
  });

  it('tells a PDF from a photo', () => {
    expect(toIdCopy(row('a', 'trade_licence', '2026-10-01T00:00:00Z', 's/documents/a.pdf')).kind).toBe('pdf');
    expect(toIdCopy(row('a', 'nid_back', '2026-10-01T00:00:00Z')).kind).toBe('image');
    expect(isPdf(Buffer.from('%PDF-1.7 ...'))).toBe(true);
    expect(isPdf(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);
  });

  it('caps the licence pages', () => {
    expect(hasLicenceRoom(MAX_LICENCE_PAGES - 1)).toBe(true);
    expect(hasLicenceRoom(MAX_LICENCE_PAGES)).toBe(false);
  });
});
