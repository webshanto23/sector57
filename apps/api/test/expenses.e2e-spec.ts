import { INestApplication } from '@nestjs/common';
import {
  addMoney,
  AUTH_COOKIES,
  budgetSchema,
  CSRF_HEADER,
  expenseDetailSchema,
  expenseHeadSchema,
  expenseListSchema,
  expenseOptionsSchema,
  fiscalYearOf,
  SETTING_KEYS,
  subtractMoney,
  vendorSchema,
  type ExpenseDetail,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { isoDate, todayDate } from './../src/common/dates.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-exp-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const today = () => isoDate(todayDate());
const pdf = () => Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF\n', 'latin1');

type Caller = { cookie: string; id: string };

/**
 * Expenses in a society of their own (ledger rows can't be deleted). The general fund (the
 * default) starts with ৳10,000 cash and ৳5,000 at the bank; the mosque fund with ৳100 cash.
 */
describe('Expenses and budgets (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'clerk' | 'clerk2' | 'approver' | 'treasurer' | 'viewer' | 'budgeter' | 'nobody', Caller>;
  const ids = {} as Record<'general' | 'mosque' | 'repairs' | 'salaries' | 'vendor' | 'otherHead' | 'otherFund', string>;

  async function makeUser(permissions: string[]): Promise<Caller> {
    const rows = await prisma.permissions.findMany();
    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
    await prisma.role_permissions.createMany({
      data: permissions.map((name) => ({ role_id: role.id, permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id })),
    });
    const user = await prisma.users.create({ data: { society_id: societyId, phone: randomPhone(), status: 'active' } });
    if (permissions.length) await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id } });
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}`, id: user.id };
  }

  const send = (method: 'post' | 'put' | 'patch' | 'delete', url: string, caller = users.admin) =>
    request(server())[method](url).set('Cookie', caller.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, caller = users.admin) => request(server()).get(url).set('Cookie', caller.cookie);
  const detail = (res: request.Response): ExpenseDetail => expenseDetailSchema.parse(res.body);
  const request_ = async (body: object = {}, caller = users.clerk): Promise<ExpenseDetail> =>
    detail(await send('post', '/expenses', caller).send({ headId: ids.repairs, description: 'পানির পাম্প মেরামত', amount: '1500', spentOn: today(), ...body }).expect(201));
  const approved = async (body: object = {}) => {
    const made = await request_(body);
    return detail(await send('post', `/expenses/${made.id}/approve`, users.approver).expect(200));
  };
  /** In minus out for a fund and account, from the ledger. */
  const balance = async (fundId: string, account = 'cash') => {
    const rows = await prisma.ledger_entries.groupBy({ by: ['direction'], where: { fund_id: fundId, account }, _sum: { amount: true } });
    const sum = (direction: string) => rows.find((row) => row.direction === direction)?._sum.amount?.toFixed(2) ?? '0.00';
    return subtractMoney(sum('in'), sum('out'));
  };
  const opening = (fund_id: string, account: string, amount: string) =>
    prisma.ledger_entries.create({
      data: { society_id: societyId, fund_id, account, amount, direction: 'in', source_type: 'opening', source_id: randomUUID(), entry_date: new Date('2026-07-01') },
    });
  const separateFunds = (on: boolean) =>
    prisma.society_settings.upsert({
      where: { society_id_key: { society_id: societyId, key: SETTING_KEYS.separateFacilityFunds } },
      create: { society_id: societyId, key: SETTING_KEYS.separateFacilityFunds, value: on },
      update: { value: on },
    });

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);

    ids.general = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'সাধারণ তহবিল', is_default: true } })).id;
    ids.mosque = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'মসজিদ তহবিল' } })).id;
    await opening(ids.general, 'cash', '10000');
    await opening(ids.general, 'bank', '5000');
    await opening(ids.mosque, 'cash', '100');

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;
    ids.otherHead = (await prisma.expense_heads.create({ data: { society_id: otherSocietyId, name_bn: 'অন্য খাত' } })).id;
    ids.otherFund = (await prisma.funds.create({ data: { society_id: otherSocietyId, name_bn: 'অন্য তহবিল', is_default: true } })).id;

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    users.clerk = await makeUser(['expenses:view', 'expenses:create']);
    users.clerk2 = await makeUser(['expenses:view', 'expenses:create']);
    users.approver = await makeUser(['expenses:view', 'expenses:create', 'expenses:approve']);
    users.treasurer = await makeUser(['expenses:view', 'expenses:edit']);
    users.viewer = await makeUser(['expenses:view']);
    users.budgeter = await makeUser(['budgets:view', 'budgets:edit']);
    users.nobody = await makeUser([]);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    // Ledger rows go only with the society (the trigger allows that cascade).
    await prisma.documents.deleteMany({ where: { society_id: societies } });
    await prisma.budgets.deleteMany({ where: { society_id: societies } });
    await prisma.expenses.deleteMany({ where: { society_id: societies } });
    await prisma.expense_heads.deleteMany({ where: { society_id: societies } });
    await prisma.vendors.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societies } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  describe('heads and vendors', () => {
    it('adds, renames and archives heads and vendors, with expenses.edit only', async () => {
      const repairs = expenseHeadSchema.parse((await send('post', '/expense-heads', users.treasurer).send({ nameBn: 'মেরামত', nameEn: 'Repairs' }).expect(201)).body);
      ids.repairs = repairs.id;
      ids.salaries = expenseHeadSchema.parse((await send('post', '/expense-heads', users.treasurer).send({ nameBn: 'কর্মচারী বেতন' }).expect(201)).body).id;
      expect((await send('post', '/expense-heads', users.treasurer).send({ nameBn: 'মেরামত' }).expect(409)).body.code).toBe('expense_head_name_taken');
      await send('post', '/expense-heads', users.clerk).send({ nameBn: 'অন্য' }).expect(403);
      await send('put', `/expense-heads/${ids.otherHead}`, users.treasurer).send({ nameBn: 'x' }).expect(404);

      const vendor = vendorSchema.parse((await send('post', '/vendors', users.treasurer).send({ name: 'রহমান ইলেকট্রিক', phone: '০১৭১১২২৩৩৪৪', service: 'বিদ্যুৎ' }).expect(201)).body);
      expect(vendor).toMatchObject({ phone: '01711223344', archived: false });
      ids.vendor = vendor.id;

      const temp = expenseHeadSchema.parse((await send('post', '/expense-heads', users.treasurer).send({ nameBn: 'অস্থায়ী' }).expect(201)).body);
      expect(expenseHeadSchema.parse((await send('post', `/expense-heads/${temp.id}/archive`, users.treasurer).expect(200)).body).archived).toBe(true);
      expect((await send('post', '/expenses', users.clerk).send({ headId: temp.id, description: 'x', amount: '1', spentOn: today() }).expect(400)).body.code).toBe('head_archived');

      const options = expenseOptionsSchema.parse((await get('/expenses/options', users.clerk).expect(200)).body);
      expect(options.heads.map((h) => h.nameBn)).toEqual(['কর্মচারী বেতন', 'মেরামত', 'অস্থায়ী']);
      expect(options.funds.map((f) => f.id)).toEqual([ids.general]);
      await get('/expenses/options', users.nobody).expect(403);
    });
  });

  describe('the flow', () => {
    it('requests, approves and pays: a voucher number, an out row, and the balance drops', async () => {
      const made = await request_({ vendorId: ids.vendor, amount: '১,৫০০.৫০' });
      expect(made).toMatchObject({ status: 'pending', amount: '1500.50', fund: { id: ids.general }, voucherNo: null, requestedBy: { id: users.clerk.id } });
      expect(made.can).toMatchObject({ edit: true, approve: false, pay: false });

      // The requester can't approve their own; an approver can.
      const own = await request_({}, users.approver);
      expect((await send('post', `/expenses/${own.id}/approve`, users.approver).expect(403)).body.code).toBe('cannot_approve_own');
      await send('post', `/expenses/${made.id}/approve`, users.treasurer).expect(403);
      await send('post', `/expenses/${made.id}/pay`, users.treasurer).send({ account: 'cash' }).expect(409);
      const ok = detail(await send('post', `/expenses/${made.id}/approve`, users.approver).expect(200));
      expect(ok).toMatchObject({ status: 'approved', approved: { by: expect.any(String) } });
      await send('patch', `/expenses/${made.id}`, users.clerk).send({ headId: ids.repairs, description: 'x', amount: '1', spentOn: today() }).expect(409);

      const before = await balance(ids.general);
      await send('post', `/expenses/${made.id}/pay`, users.clerk).send({ account: 'cash' }).expect(403);
      const paid = detail(await send('post', `/expenses/${made.id}/pay`, users.treasurer).send({ account: 'cash' }).expect(200));
      expect(paid.status).toBe('paid');
      expect(paid.voucherNo).toMatch(/^EXP-\d{2}-\d{4}$/);
      expect(paid.paid).toMatchObject({ account: 'cash' });
      expect(await balance(ids.general)).toBe(subtractMoney(before, '1500.50'));
      const row = await prisma.ledger_entries.findFirstOrThrow({ where: { source_type: 'expense', source_id: made.id } });
      expect(row).toMatchObject({ direction: 'out', account: 'cash', memo: paid.voucherNo });
      expect((await send('post', `/expenses/${made.id}/pay`, users.treasurer).send({ account: 'cash' }).expect(409)).body.code).toBe('expense_not_approved');
    });

    it('lets the requester edit and an approver reject with a reason, while pending', async () => {
      const made = await request_();
      await send('patch', `/expenses/${made.id}`, users.clerk2).send({ headId: ids.salaries, description: 'x', amount: '1', spentOn: today() }).expect(403);
      const edited = detail(
        await send('patch', `/expenses/${made.id}`, users.clerk).send({ headId: ids.salaries, description: 'আগস্টের বেতন', amount: '0.10', spentOn: today() }).expect(200),
      );
      expect(edited).toMatchObject({ head: { id: ids.salaries }, amount: '0.10', description: 'আগস্টের বেতন' });
      await send('post', `/expenses/${made.id}/reject`, users.approver).send({}).expect(400);
      const rejected = detail(await send('post', `/expenses/${made.id}/reject`, users.approver).send({ reason: 'বিল নেই' }).expect(200));
      expect(rejected).toMatchObject({ status: 'rejected', rejected: { reason: 'বিল নেই' }, can: { edit: false, upload: false } });
      expect((await send('post', `/expenses/${made.id}/approve`, users.approver).expect(409)).body.code).toBe('expense_changed');
    });

    it('refuses more than the fund holds in that account, and a closed fund', async () => {
      const big = await approved({ amount: '6000' });
      const refused = await send('post', `/expenses/${big.id}/pay`, users.treasurer).send({ account: 'bank' }).expect(409);
      expect(refused.body.code).toBe('fund_insufficient');
      expect(await prisma.ledger_entries.count({ where: { source_type: 'expense', source_id: big.id } })).toBe(0);
      // Cash holds enough.
      detail(await send('post', `/expenses/${big.id}/pay`, users.treasurer).send({ account: 'cash' }).expect(200));

      await separateFunds(true);
      const mosque = await approved({ fundId: ids.mosque, amount: '50' });
      await prisma.funds.update({ where: { id: ids.mosque }, data: { closed_at: new Date() } });
      expect((await send('post', `/expenses/${mosque.id}/pay`, users.treasurer).send({ account: 'cash' }).expect(409)).body.code).toBe('fund_closed');
      await prisma.funds.update({ where: { id: ids.mosque }, data: { closed_at: null } });
      expect((await send('post', '/expenses', users.clerk).send({ headId: ids.repairs, fundId: ids.otherFund, description: 'x', amount: '1', spentOn: today() }).expect(400)).body.code).toBe(
        'invalid_fund',
      );
      await separateFunds(false);
      expect((await send('post', '/expenses', users.clerk).send({ headId: ids.repairs, fundId: ids.mosque, description: 'x', amount: '1', spentOn: today() }).expect(400)).body.code).toBe('invalid_fund');
    });

    it('never lets two payments overdraw a fund', async () => {
      await separateFunds(true);
      // The mosque fund holds ৳100 cash: only one of these may be paid.
      const a = await approved({ fundId: ids.mosque, amount: '70' });
      const b = await approved({ fundId: ids.mosque, amount: '70' });
      const results = await Promise.all([a, b].map((e) => send('post', `/expenses/${e.id}/pay`, users.treasurer).send({ account: 'cash' })));
      expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([200, 409]);
      expect(await balance(ids.mosque)).toBe('30.00');
      await separateFunds(false);
    });

    it('gives vouchers numbers without gaps', async () => {
      const made = await Promise.all([1, 2, 3].map(() => approved({ amount: '1' })));
      const paid = await Promise.all(made.map((e) => send('post', `/expenses/${e.id}/pay`, users.treasurer).send({ account: 'bank' }).expect(200)));
      const numbers = paid.map((res) => Number(detail(res).voucherNo!.slice(-4))).sort((x, y) => x - y);
      expect(numbers[2]! - numbers[0]!).toBe(2);
      expect(new Set(numbers).size).toBe(3);
    });

    it('voids a paid expense with a reversing row, and an approved one with none', async () => {
      const paid = await approved({ amount: '200' });
      await send('post', `/expenses/${paid.id}/pay`, users.treasurer).send({ account: 'cash' }).expect(200);
      const before = await balance(ids.general);
      await send('post', `/expenses/${paid.id}/void`, users.treasurer).send({ reason: 'ভুল' }).expect(403);
      const voided = detail(await send('post', `/expenses/${paid.id}/void`, users.approver).send({ reason: 'দ্বিগুণ লেখা' }).expect(200));
      expect(voided).toMatchObject({ status: 'void', void: { reason: 'দ্বিগুণ লেখা' }, voucherNo: expect.any(String) });
      expect(await balance(ids.general)).toBe(addMoney(before, '200.00'));
      const reversal = await prisma.ledger_entries.findFirstOrThrow({ where: { source_type: 'expense', source_id: paid.id, direction: 'in' } });
      expect(reversal.reverses_id).not.toBeNull();

      const unpaid = await approved({ amount: '5' });
      detail(await send('post', `/expenses/${unpaid.id}/void`, users.approver).send({ reason: 'বাতিল' }).expect(200));
      expect(await prisma.ledger_entries.count({ where: { source_id: unpaid.id } })).toBe(0);
      expect((await send('post', `/expenses/${unpaid.id}/void`, users.approver).send({ reason: 'আবার' }).expect(409)).body.code).toBe('expense_not_voidable');
      const pending = await request_();
      expect((await send('post', `/expenses/${pending.id}/void`, users.approver).send({ reason: 'x' }).expect(409)).body.code).toBe('expense_not_voidable');
    });

    it('refuses bad input', async () => {
      for (const amount of ['0', '-1', '1.001']) await send('post', '/expenses', users.clerk).send({ headId: ids.repairs, description: 'x', amount, spentOn: today() }).expect(400);
      const tomorrow = isoDate(new Date(Date.now() + 2 * 86_400_000));
      expect((await send('post', '/expenses', users.clerk).send({ headId: ids.repairs, description: 'x', amount: '1', spentOn: tomorrow }).expect(400)).body.code).toBe('future_date');
      expect((await send('post', '/expenses', users.clerk).send({ headId: ids.otherHead, description: 'x', amount: '1', spentOn: today() }).expect(400)).body.code).toBe('invalid_head');
      expect((await send('post', '/expenses', users.clerk).send({ headId: ids.repairs, vendorId: randomUUID(), description: 'x', amount: '1', spentOn: today() }).expect(400)).body.code).toBe('invalid_vendor');
      await send('post', '/expenses', users.viewer).send({ headId: ids.repairs, description: 'x', amount: '1', spentOn: today() }).expect(403);
    });
  });

  describe('vouchers', () => {
    it('stores a PDF or photo, serves it only to expense viewers, and refuses other files', async () => {
      const made = await request_();
      const withFile = detail(await send('post', `/expenses/${made.id}/vouchers`, users.clerk).attach('file', pdf(), 'bill.pdf').expect(201));
      expect(withFile.vouchers).toEqual([expect.objectContaining({ isImage: false, fileName: 'voucher-1.pdf' })]);
      const url = `/expenses/${made.id}/vouchers/${withFile.vouchers[0]!.id}`;
      const res = await get(url, users.viewer).buffer(true).expect(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(Buffer.from(res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      await get(url, users.nobody).expect(403);
      await request(server()).get(url).expect(401);

      await send('post', `/expenses/${made.id}/vouchers`, users.clerk).attach('file', Buffer.from('hello'), 'x.txt').expect(415);
      await send('post', `/expenses/${made.id}/vouchers`, users.clerk2).attach('file', pdf(), 'bill.pdf').expect(403);
      await send('post', `/expenses/${made.id}/vouchers`, users.clerk).expect(400);

      // Removed before payment; kept once paid.
      const removed = detail(await send('post', `/expenses/${made.id}/vouchers/${withFile.vouchers[0]!.id}/remove`, users.clerk).expect(200));
      expect(removed.vouchers).toEqual([]);
      await get(url, users.viewer).expect(404);
      const again = detail(await send('post', `/expenses/${made.id}/vouchers`, users.clerk).attach('file', pdf(), 'bill.pdf').expect(201));
      await send('post', `/expenses/${made.id}/approve`, users.approver).expect(200);
      await send('post', `/expenses/${made.id}/pay`, users.treasurer).send({ account: 'cash' }).expect(200);
      expect((await send('post', `/expenses/${made.id}/vouchers/${again.vouchers[0]!.id}/remove`, users.clerk).expect(409)).body.code).toBe('expense_voucher_locked');
      // A bill that arrives after payment can still be added.
      detail(await send('post', `/expenses/${made.id}/vouchers`, users.treasurer).attach('file', pdf(), 'late.pdf').expect(201));

      const list = expenseListSchema.parse((await get(`/expenses?q=${encodeURIComponent('পাম্প')}&status=paid`, users.viewer).expect(200)).body);
      expect(list.items.find((e) => e.id === made.id)?.vouchers).toBe(2);
    });
  });

  describe('reading', () => {
    it('lists with filters and totals that match the rows', async () => {
      const list = expenseListSchema.parse((await get('/expenses?pageSize=100', users.viewer).expect(200)).body);
      const counting = list.items.filter((e) => e.status !== 'rejected' && e.status !== 'void');
      expect(list.totals.amount).toBe(addMoney('0', ...counting.map((e) => e.amount)));
      const pending = list.items.filter((e) => e.status === 'pending');
      expect(list.summary.pending).toEqual({ count: pending.length, amount: addMoney('0', ...pending.map((e) => e.amount)) });
      const paid = list.items.filter((e) => e.status === 'paid');
      expect(list.summary.paidMonth.amount).toBe(addMoney('0', ...paid.map((e) => e.amount)));

      const mine = expenseListSchema.parse((await get('/expenses?requestedBy=me&pageSize=100', users.approver).expect(200)).body);
      expect(mine.items.every((e) => e.requestedBy?.id === users.approver.id)).toBe(true);
      const byVendor = expenseListSchema.parse((await get(`/expenses?vendorId=${ids.vendor}`, users.viewer).expect(200)).body);
      expect(byVendor.items.map((e) => e.vendor?.id)).toEqual([ids.vendor]);
      const byVendorName = expenseListSchema.parse((await get(`/expenses?q=${encodeURIComponent('রহমান')}`, users.viewer).expect(200)).body);
      expect(byVendorName.total).toBe(1);
      await get('/expenses', users.nobody).expect(403);
      await get('/expenses', users.budgeter).expect(403);
    });

    it('keeps each society to itself', async () => {
      const otherUser = await prisma.users.create({ data: { society_id: otherSocietyId, phone: randomPhone(), status: 'active' } });
      const other = await prisma.expenses.create({
        data: { society_id: otherSocietyId, expense_head_id: ids.otherHead, fund_id: ids.otherFund, description: 'x', amount: '1', spent_on: new Date(), requested_by: otherUser.id },
      });
      await get(`/expenses/${other.id}`).expect(404);
      for (const action of ['approve', 'pay', 'void', 'reject']) {
        await send('post', `/expenses/${other.id}/${action}`).send({ reason: 'x', account: 'cash' }).expect(404);
      }
      await send('patch', `/expenses/${other.id}`).send({ headId: ids.repairs, description: 'x', amount: '1', spentOn: today() }).expect(404);
      const list = expenseListSchema.parse((await get('/expenses?pageSize=100').expect(200)).body);
      expect(list.items.map((e) => e.id)).not.toContain(other.id);
    });

    it('has no delete routes', async () => {
      const [first] = expenseListSchema.parse((await get('/expenses').expect(200)).body).items;
      await send('delete', `/expenses/${first!.id}`).expect(404);
      await send('delete', `/expense-heads/${ids.repairs}`).expect(404);
      await send('delete', `/vendors/${ids.vendor}`).expect(404);
    });
  });

  describe('budgets', () => {
    it('sets amounts per head and shows approved, paid and what is left', async () => {
      const start = (await prisma.societies.findUniqueOrThrow({ where: { id: societyId } })).fiscal_year_start_month;
      const year = fiscalYearOf(today(), start).label;
      await send('put', '/budgets', users.viewer).send({ year, lines: [{ headId: ids.repairs, amount: '1' }] }).expect(403);
      expect((await send('put', '/budgets', users.budgeter).send({ year: '2026', lines: [{ headId: ids.repairs, amount: '1' }] }).expect(400)).body.code).toBe('invalid_year');
      expect((await send('put', '/budgets', users.budgeter).send({ year, lines: [{ headId: ids.otherHead, amount: '1' }] }).expect(400)).body.code).toBe('invalid_head');

      const set = budgetSchema.parse(
        (
          await send('put', '/budgets', users.budgeter)
            .send({ year, lines: [{ headId: ids.repairs, amount: '5000' }, { headId: ids.salaries, amount: '০' }] })
            .expect(200)
        ).body,
      );
      const repairs = set.lines.find((line) => line.head.id === ids.repairs)!;
      const [{ approved, paid }] = await prisma.$queryRaw<{ approved: string; paid: string }[]>`
        SELECT coalesce(sum(amount) FILTER (WHERE status = 'approved'), 0)::numeric(16,2)::text AS approved,
               coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0)::numeric(16,2)::text AS paid
        FROM expenses WHERE expense_head_id = ${ids.repairs}::uuid`;
      expect(repairs).toMatchObject({ budget: '5000.00', approved, paid, remaining: subtractMoney('5000.00', addMoney(approved, paid)) });
      expect(repairs.over).toBe(true);
      expect(set.lines.find((line) => line.head.id === ids.salaries)!.budget).toBeNull();
      expect(set.years).toContain(year);
      expect(set.totals.budget).toBe('5000.00');

      // The expense page shows its head's budget line.
      const [one] = expenseListSchema.parse((await get(`/expenses?headId=${ids.repairs}&status=paid`).expect(200)).body).items;
      const shown = detail(await get(`/expenses/${one!.id}`).expect(200));
      expect(shown.budget).toMatchObject({ year, amount: '5000.00', over: true });

      // Zero clears it.
      const cleared = budgetSchema.parse((await send('put', '/budgets', users.budgeter).send({ year, lines: [{ headId: ids.repairs, amount: '0' }] }).expect(200)).body);
      expect(cleared.lines.find((line) => line.head.id === ids.repairs)!.budget).toBeNull();
      await get('/budgets', users.viewer).expect(403);
    });
  });

  describe('the ledger', () => {
    it('agrees with the paid expenses', async () => {
      const [{ sum }] = await prisma.$queryRaw<{ sum: string }[]>`
        SELECT coalesce(sum(amount), 0)::numeric(16,2)::text AS sum FROM expenses WHERE society_id = ${societyId}::uuid AND status = 'paid'`;
      const rows = await prisma.ledger_entries.groupBy({ by: ['direction'], where: { society_id: societyId, source_type: 'expense' }, _sum: { amount: true } });
      const of = (direction: string) => rows.find((row) => row.direction === direction)?._sum.amount?.toFixed(2) ?? '0.00';
      expect(subtractMoney(of('out'), of('in'))).toBe(sum);
    });

    it('refuses a row that breaks the database checks', async () => {
      const [pending] = expenseListSchema.parse((await get('/expenses?status=pending').expect(200)).body).items;
      await expect(prisma.expenses.update({ where: { id: pending!.id }, data: { status: 'paid' } })).rejects.toThrow();
      await expect(prisma.expenses.update({ where: { id: pending!.id }, data: { status: 'approved', approved_by: pending!.requestedBy!.id, approved_at: new Date() } })).rejects.toThrow();
    });
  });
});
