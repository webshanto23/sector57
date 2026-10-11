import { invoiceCreateSchema, openingArrearsSchema, isOverdue, periodDays, pickBillTo, type BillToFacts, type OwnerCandidate } from './billing.js';

const id = (n: number) => `3f0e7a52-9a0c-4a5e-9a52-7b2f8d1c0a${String(n).padStart(2, '0')}`;
const person = (n: number) => ({ kind: 'person' as const, id: id(n) });
const owner = (n: number, sharePercent = '100.00', startDate = '2020-01-01'): OwnerCandidate => ({ payer: person(n), sharePercent, startDate });

const facts = (extra: Partial<BillToFacts> = {}): BillToFacts => ({ billTo: 'owner', tenancy: null, ownersByLevel: [], ...extra });

describe('pickBillTo', () => {
  it('bills the renter only when the unit says so and the renter has moved in', () => {
    const renter = { kind: 'organisation' as const, id: id(9) };
    const owners = [[owner(1)]];
    expect(pickBillTo(facts({ billTo: 'renter', tenancy: { status: 'active', payer: renter }, ownersByLevel: owners }))).toEqual({
      payer: renter,
      role: 'renter',
    });
    expect(pickBillTo(facts({ billTo: 'renter', tenancy: { status: 'moving_out', payer: renter }, ownersByLevel: owners }))?.role).toBe('renter');
    // Not moved in yet, or the unit bills its owner: the owner pays.
    expect(pickBillTo(facts({ billTo: 'renter', tenancy: { status: 'pending', payer: renter }, ownersByLevel: owners }))?.role).toBe('owner');
    expect(pickBillTo(facts({ billTo: 'owner', tenancy: { status: 'active', payer: renter }, ownersByLevel: owners }))?.role).toBe('owner');
  });

  it('falls back to the nearest owners above the unit', () => {
    expect(pickBillTo(facts({ ownersByLevel: [[], [owner(2)], [owner(3)]] }))?.payer).toEqual(person(2));
    expect(pickBillTo(facts({ ownersByLevel: [[owner(1)], [owner(2)]] }))?.payer).toEqual(person(1));
  });

  it('picks the largest share among co-owners, then the earliest start', () => {
    expect(pickBillTo(facts({ ownersByLevel: [[owner(1, '33.33'), owner(2, '66.67')]] }))?.payer).toEqual(person(2));
    expect(pickBillTo(facts({ ownersByLevel: [[owner(1, '50.00', '2021-05-01'), owner(2, '50.00', '2019-02-01')]] }))?.payer).toEqual(person(2));
    expect(pickBillTo(facts({ ownersByLevel: [[owner(1, '9.50'), owner(2, '10.00')]] }))?.payer).toEqual(person(2));
  });

  it('finds nobody when no one owns or rents', () => {
    expect(pickBillTo(facts({ ownersByLevel: [[], []] }))).toBeNull();
    expect(pickBillTo(facts({ billTo: 'renter', tenancy: { status: 'active', payer: null }, ownersByLevel: [] }))).toBeNull();
  });
});

describe('billing helpers', () => {
  it('derives overdue from open bills due before today', () => {
    expect(isOverdue('unpaid', '2026-10-10', '2026-10-11')).toBe(true);
    expect(isOverdue('partial', '2026-10-10', '2026-10-11')).toBe(true);
    expect(isOverdue('unpaid', '2026-10-11', '2026-10-11')).toBe(false);
    expect(isOverdue('paid', '2026-01-01', '2026-10-11')).toBe(false);
    expect(isOverdue('void', '2026-01-01', '2026-10-11')).toBe(false);
  });

  it('turns months into the first and last day they cover', () => {
    expect(periodDays('2026-11', null)).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(periodDays('2026-10', '2026-12')).toEqual({ start: '2026-10-01', end: '2026-12-31' });
    expect(periodDays('2028-02', undefined)).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(periodDays(null, null)).toBeNull();
  });
});

describe('invoiceCreateSchema', () => {
  const line = { chargeTypeId: id(5), amount: '১,৫০০' };

  it('reads amounts in Bangla digits and fills blank descriptions with null', () => {
    const parsed = invoiceCreateSchema.parse({ unitId: id(1), dueDate: '2026-11-15', lines: [line] });
    expect(parsed).toMatchObject({ lines: [{ amount: '1500.00', description: null, descriptionEn: null }] });
  });

  it('refuses a period that ends before it starts, or has only an end', () => {
    const base = { unitId: id(1), dueDate: '2026-11-15', lines: [line] };
    expect(invoiceCreateSchema.safeParse({ ...base, periodFrom: '2026-11', periodTo: '2026-10' }).success).toBe(false);
    expect(invoiceCreateSchema.safeParse({ ...base, periodTo: '2026-10' }).success).toBe(false);
    expect(invoiceCreateSchema.safeParse({ ...base, periodFrom: '2026-10', periodTo: '2026-12' }).success).toBe(true);
  });

  it('needs a unit or a person, not both', () => {
    const base = { dueDate: '2026-11-15', lines: [line] };
    expect(invoiceCreateSchema.safeParse(base).success).toBe(false);
    expect(invoiceCreateSchema.safeParse({ ...base, unitId: id(1), personId: id(2) }).success).toBe(false);
    expect(invoiceCreateSchema.safeParse({ ...base, personId: id(2) }).success).toBe(true);
  });

  it('needs at least one line and a positive amount', () => {
    expect(invoiceCreateSchema.safeParse({ personId: id(1), dueDate: '2026-11-15', lines: [] }).success).toBe(false);
    expect(openingArrearsSchema.safeParse({ unitId: id(1), asOf: '2026-06-30', chargeTypeId: id(5), amount: '0' }).success).toBe(false);
    expect(openingArrearsSchema.parse({ unitId: id(1), asOf: '2026-06-30', chargeTypeId: id(5), amount: '৭২,০০০' }).amount).toBe('72000.00');
  });
});
