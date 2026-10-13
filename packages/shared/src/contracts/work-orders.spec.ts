import { formatDocumentNo, documentPeriod } from '../fiscal.js';
import { workOrderCreateSchema, workOrderDoneSchema, workOrderMoves, workOrderNumberOf, workOrderSourceOf } from './work-orders.js';

const id = '7c4b0a5e-9a4f-4f37-8a51-0b6f3d2f1c11';

describe('work order contracts', () => {
  it('lists the changes and what each needs', () => {
    expect(workOrderMoves('open')).toEqual([
      { to: 'in_progress', needs: 'edit' },
      { to: 'done', needs: 'edit' },
      { to: 'cancelled', needs: 'approve' },
    ]);
    expect(workOrderMoves('in_progress').map((move) => move.to)).toEqual(['done', 'cancelled']);
    expect(workOrderMoves('done')).toEqual([]);
    expect(workOrderMoves('cancelled')).toEqual([]);
  });

  it('says where a work order came from', () => {
    expect(workOrderSourceOf({ ticketId: id, assetId: null, planId: null })).toBe('ticket');
    expect(workOrderSourceOf({ ticketId: null, assetId: id, planId: id })).toBe('plan');
    expect(workOrderSourceOf({ ticketId: id, assetId: id, planId: null })).toBe('ticket');
    expect(workOrderSourceOf({ ticketId: null, assetId: id, planId: null })).toBe('asset');
    expect(workOrderSourceOf({ ticketId: null, assetId: null, planId: null })).toBe('none');
  });

  it('needs a place or a source, and at most one assignee', () => {
    expect(workOrderCreateSchema.safeParse({ title: 'ড্রেন পরিষ্কার' }).success).toBe(false);
    expect(workOrderCreateSchema.safeParse({ title: 'ড্রেন পরিষ্কার', locationId: id }).success).toBe(true);
    expect(workOrderCreateSchema.safeParse({ title: 'পাম্প', planId: id }).success).toBe(true);
    expect(workOrderCreateSchema.safeParse({ title: 'পাম্প', ticketId: id, staffId: id, vendorId: id }).success).toBe(false);
  });

  it('needs an expense head when finishing with a cost', () => {
    const done = { completedOn: '2026-10-13', note: 'হয়ে গেছে' };
    expect(workOrderDoneSchema.parse(done).cost).toBeNull();
    expect(workOrderDoneSchema.safeParse({ ...done, cost: '১,২০০' }).success).toBe(false);
    expect(workOrderDoneSchema.parse({ ...done, cost: '১,২০০', headId: id }).cost).toBe('1200.00');
    expect(workOrderDoneSchema.safeParse({ ...done, cost: '0' }).success).toBe(false);
    expect(workOrderDoneSchema.safeParse({ completedOn: '2026-10-13', note: ' ' }).success).toBe(false);
  });

  it('numbers work orders by fiscal year and tickets for good', () => {
    expect(formatDocumentNo('work_order', documentPeriod('work_order', '2026-10-13', 7), 3)).toBe('WO-26-0003');
    expect(formatDocumentNo('work_order', documentPeriod('work_order', '2026-06-30', 7), 3)).toBe('WO-25-0003');
    expect(formatDocumentNo('ticket', documentPeriod('ticket', '2026-10-13', 7), 41)).toBe('T-0041');
  });

  it('reads a work order number with or without its year', () => {
    expect(workOrderNumberOf('WO-26-0012')).toEqual({ period: '26', no: 12 });
    expect(workOrderNumberOf('wo 26-12')).toEqual({ period: '26', no: 12 });
    expect(workOrderNumberOf('২৬-১২')).toEqual({ period: '26', no: 12 });
    expect(workOrderNumberOf('12')).toEqual({ period: null, no: 12 });
    expect(workOrderNumberOf('pump')).toBeNull();
  });
});
