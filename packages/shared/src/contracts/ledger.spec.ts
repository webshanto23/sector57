import { ledgerQuery, transferInputSchema, transferKind } from '../index.js';

const fund = '5f0c9a1e-2b3c-4d5e-8f70-1a2b3c4d5e6f';
const other = '6a1d0b2f-3c4d-4e5f-9a81-2b3c4d5e6f70';

describe('transfers', () => {
  it('takes a deposit with Bangla digits and cleans the memo', () => {
    const parsed = transferInputSchema.parse({ fromFundId: fund, fromAccount: 'cash', toFundId: fund, toAccount: 'bank', amount: '১২৫০.৫০', memo: '  স্লিপ ১২  ' });
    expect(parsed.amount).toBe('1250.50');
    expect(parsed.memo).toBe('স্লিপ ১২');
  });

  it('refuses a transfer that moves nothing, and zero or negative amounts', () => {
    const same = transferInputSchema.safeParse({ fromFundId: fund, fromAccount: 'cash', toFundId: fund, toAccount: 'cash', amount: '10' });
    expect(same.success).toBe(false);
    expect(same.error?.issues[0]?.message).toBe('transfer_nothing_moves');
    expect(transferInputSchema.safeParse({ fromFundId: fund, fromAccount: 'cash', toFundId: other, toAccount: 'cash', amount: '0' }).success).toBe(false);
    expect(transferInputSchema.safeParse({ fromFundId: fund, fromAccount: 'cash', toFundId: other, toAccount: 'cash', amount: '-5' }).success).toBe(false);
    expect(transferInputSchema.safeParse({ fromFundId: fund, fromAccount: 'safe', toFundId: other, toAccount: 'cash', amount: '5' }).success).toBe(false);
  });

  it('names what a transfer is', () => {
    expect(transferKind({ fromFundId: fund, fromAccount: 'cash', toFundId: fund, toAccount: 'bank' })).toBe('deposit');
    expect(transferKind({ fromFundId: fund, fromAccount: 'bank', toFundId: fund, toAccount: 'cash' })).toBe('withdrawal');
    expect(transferKind({ fromFundId: fund, fromAccount: 'cash', toFundId: other, toAccount: 'cash' })).toBe('between_funds');
  });
});

describe('ledger query', () => {
  it('pages and filters, refusing an unknown account', () => {
    expect(ledgerQuery.parse({ account: 'bank', page: '2' })).toMatchObject({ account: 'bank', page: 2, pageSize: 20 });
    expect(ledgerQuery.safeParse({ account: 'safe' }).success).toBe(false);
  });
});
