import { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  CSRF_HEADER,
  overviewSchema,
  payrollMonthSchema,
  payrollRunSchema,
  payslipSheetSchema,
  SETTING_KEYS,
  subtractMoney,
  type PayrollRun,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-pay-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';
/** August 2026: 31 days. */
const MONTH = '2026-08';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const aug = (n: number) => `${MONTH}-${String(n).padStart(2, '0')}`;

type Caller = { cookie: string; id: string };

/**
 * Payroll in a society of its own (ledger rows can't be deleted). Staff for August 2026:
 * - Karim, permanent, ৳9,300 a month (৳300 a day): 2 absent days and 1 half day;
 * - Jamal, daily, ৳650 a day: 20 days present and 3 half days;
 * - Salma, contract, ৳10,000 a month, joined 21 August (11 of 31 days);
 * - Rafiq left in July and is not paid.
 * The general fund holds ৳100,000 cash; the mosque fund ৳100.
 */
describe('Payroll (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'clerk' | 'approver' | 'auditor' | 'viewer' | 'noExpenses', Caller>;
  const ids = {} as Record<'general' | 'mosque' | 'salaries' | 'karim' | 'jamal' | 'salma' | 'rafiq' | 'otherRun', string>;
  let run: PayrollRun;

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

  const send = (method: 'post' | 'patch', url: string, caller = users.clerk) =>
    request(server())[method](url).set('Cookie', caller.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, caller = users.clerk) => request(server()).get(url).set('Cookie', caller.cookie);
  const parse = (res: request.Response): PayrollRun => payrollRunSchema.parse(res.body);
  const slipOf = (of: PayrollRun, staffId: string) => of.payslips.find((slip) => slip.staff.id === staffId)!;
  const balance = async (fundId: string, account = 'cash') => {
    const rows = await prisma.ledger_entries.groupBy({ by: ['direction'], where: { fund_id: fundId, account }, _sum: { amount: true } });
    const sum = (direction: string) => rows.find((row) => row.direction === direction)?._sum.amount?.toFixed(2) ?? '0.00';
    return subtractMoney(sum('in'), sum('out'));
  };
  const opening = (fund_id: string, amount: string) =>
    prisma.ledger_entries.create({
      data: { society_id: societyId, fund_id, account: 'cash', amount, direction: 'in', source_type: 'opening', source_id: randomUUID(), entry_date: day('2026-07-01') },
    });
  const marks = (staffId: string, status: string, days: number[]) =>
    prisma.attendance.createMany({ data: days.map((n) => ({ society_id: societyId, staff_id: staffId, date: day(aug(n)), status })) });

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
    await opening(ids.general, '100000');
    await opening(ids.mosque, '100');
    ids.salaries = (await prisma.expense_heads.create({ data: { society_id: societyId, name_bn: 'কর্মী বেতন' } })).id;

    const level = await prisma.location_levels.create({ data: { society_id: societyId, depth: 1, name_bn: 'ব্লক' } });
    const placeId = randomUUID();
    await prisma.locations.create({ data: { id: placeId, society_id: societyId, level_id: level.id, name: 'ব্লক সি', path: `/${placeId}/` } });
    let no = 0;
    const hire = async (name: string, kind: string, pay: string, joined: string, left: string | null = null) => {
      const person = await prisma.persons.create({ data: { society_id: societyId, full_name: name } });
      return (
        await prisma.staff.create({
          data: {
            society_id: societyId,
            person_id: person.id,
            staff_no: ++no,
            designation_bn: 'প্রহরী',
            kind,
            posted_location_id: placeId,
            joined_on: day(joined),
            left_on: left ? day(left) : null,
            left_reason: left ? 'অবসর' : null,
            ...(kind === 'daily' ? { daily_rate: pay } : { monthly_salary: pay }),
          },
        })
      ).id;
    };
    ids.karim = await hire('করিম', 'permanent', '9300', '2025-01-01');
    ids.jamal = await hire('জামাল', 'daily', '650', '2025-06-01');
    ids.salma = await hire('সালমা', 'contract', '10000', aug(21));
    ids.rafiq = await hire('রফিক', 'permanent', '8000', '2024-01-01', '2026-07-31');
    await marks(ids.karim, 'absent', [3, 4]);
    await marks(ids.karim, 'half_day', [5]);
    await marks(ids.karim, 'leave', [6]);
    await marks(ids.jamal, 'present', Array.from({ length: 20 }, (_, i) => i + 1));
    await marks(ids.jamal, 'half_day', [21, 22, 23]);
    await marks(ids.jamal, 'absent', [24]);

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;
    ids.otherRun = (await prisma.payroll_runs.create({ data: { society_id: otherSocietyId, month: day(aug(1)) } })).id;

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    users.clerk = await makeUser(['payroll:view', 'payroll:create', 'payroll:edit', 'payroll:approve', 'expenses:create']);
    users.approver = await makeUser(['payroll:view', 'payroll:approve']);
    users.auditor = await makeUser(['payroll:view', 'payroll:approve', 'expenses:view', 'expenses:approve']);
    users.viewer = await makeUser(['payroll:view']);
    users.noExpenses = await makeUser(['payroll:view', 'payroll:edit']);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    // Payroll, ledger and expense rows go with the society (the triggers allow that cascade).
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societies } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  it('prepares a draft with pay exact to the paisa, once per month', async () => {
    await send('post', '/payroll', users.viewer).send({ month: MONTH }).expect(403);
    expect((await send('post', '/payroll').send({ month: '2999-01' }).expect(400)).body.code).toBe('future_month');
    run = parse(await send('post', '/payroll').send({ month: MONTH }).expect(201));
    expect(run.status).toBe('draft');
    expect(run.payslips.map((slip) => slip.staff.id)).toEqual([ids.karim, ids.jamal, ids.salma]);
    // 9300 less 2.5 days at 300.
    expect(slipOf(run, ids.karim)).toMatchObject({ base: '9300.00', attendanceDeduction: '750.00', net: '8550.00', absentDays: 2, halfDays: 1, daysEmployed: 31 });
    // 650 × 21.5.
    expect(slipOf(run, ids.jamal)).toMatchObject({ base: '13975.00', attendanceDeduction: '0.00', net: '13975.00' });
    // 10000 × 11 / 31 = 3548.387…
    expect(slipOf(run, ids.salma)).toMatchObject({ base: '3548.39', net: '3548.39', daysEmployed: 11 });
    expect(run.totals).toMatchObject({ count: 3, net: '26073.39' });
    expect(run.can).toEqual({ edit: true, approve: false, pay: false, void: true });

    expect((await send('post', '/payroll').send({ month: MONTH }).expect(409)).body.code).toBe('payroll_exists');
    const view = payrollMonthSchema.parse((await get(`/payroll?month=${MONTH}`, users.viewer).expect(200)).body);
    expect(view.run?.id).toBe(run.id);
    expect(view.can.create).toBe(false);
  });

  it('edits payslip lines and funds on a draft, and a refresh keeps them', async () => {
    const salma = slipOf(run, ids.salma);
    const url = `/payroll/${run.id}/payslips/${salma.id}`;
    const lines = [
      { kind: 'allowance', labelBn: 'যাতায়াত', amount: '0.10' },
      { kind: 'allowance', labelBn: 'ঈদ বোনাস', amount: '1000.20' },
      { kind: 'deduction', labelBn: 'অগ্রিম', amount: '48.39' },
    ];
    expect((await send('patch', url).send({ fundId: ids.general, lines: [{ kind: 'deduction', labelBn: 'x', amount: '3548.40' }] }).expect(400)).body.code).toBe('negative_net');
    expect((await send('patch', url).send({ fundId: ids.mosque, lines }).expect(400)).body.code).toBe('invalid_fund');
    await prisma.society_settings.create({ data: { society_id: societyId, key: SETTING_KEYS.separateFacilityFunds, value: true } });
    run = parse(await send('patch', url).send({ fundId: ids.mosque, note: 'আগস্টে যোগ দিয়েছেন', lines }).expect(200));
    expect(slipOf(run, ids.salma)).toMatchObject({ allowances: '1000.30', deductions: '48.39', net: '4500.30', note: 'আগস্টে যোগ দিয়েছেন', fund: { id: ids.mosque } });
    expect(run.byFund).toEqual(
      expect.arrayContaining([
        { fund: expect.objectContaining({ id: ids.general }), net: '22525.00' },
        { fund: expect.objectContaining({ id: ids.mosque }), net: '4500.30' },
      ]),
    );

    // A late mark changes the pay; the lines, note and fund stay.
    await marks(ids.karim, 'absent', [7]);
    run = parse(await send('post', `/payroll/${run.id}/refresh`).expect(200));
    expect(slipOf(run, ids.karim)).toMatchObject({ attendanceDeduction: '1050.00', net: '8250.00' });
    expect(slipOf(run, ids.salma)).toMatchObject({ net: '4500.30', fund: { id: ids.mosque } });
    expect(slipOf(run, ids.salma).lines.map((line) => line.amount)).toEqual(['0.10', '1000.20', '48.39']);
  });

  it('never lets the preparer approve, and freezes payslips once approved', async () => {
    expect((await send('post', `/payroll/${run.id}/approve`).expect(403)).body.code).toBe('cannot_approve_own');
    run = parse(await send('post', `/payroll/${run.id}/approve`, users.approver).expect(200));
    expect(run.status).toBe('approved');
    expect(run.can.approve).toBe(false);
    // The overview asks the one who may pay to do so.
    const overview = overviewSchema.parse((await get('/overview').expect(200)).body);
    expect(overview.approvals?.payroll).toEqual({ count: 1, items: [{ id: run.id, month: MONTH, status: 'approved', net: '26725.30' }] });

    const salma = slipOf(run, ids.salma);
    expect((await send('patch', `/payroll/${run.id}/payslips/${salma.id}`).send({ fundId: ids.general, lines: [] }).expect(409)).body.code).toBe('payroll_not_draft');
    await send('post', `/payroll/${run.id}/refresh`).expect(409);
    // The database refuses too.
    await expect(prisma.payslips.update({ where: { id: salma.id }, data: { note: 'x' } })).rejects.toThrow();
    await expect(prisma.payroll_runs.delete({ where: { id: run.id } })).rejects.toThrow();
  });

  it('pays one expense per fund, or nothing when a fund is short', async () => {
    expect((await send('post', `/payroll/${run.id}/pay`, users.noExpenses).send({ account: 'cash', headId: ids.salaries }).expect(403)).body.code).toBe('pay_needs_expenses');
    // The mosque fund holds ৳100 but owes ৳4,500.30.
    expect((await send('post', `/payroll/${run.id}/pay`).send({ account: 'cash', headId: ids.salaries }).expect(409)).body.code).toBe('fund_insufficient');
    expect(await prisma.expenses.count({ where: { society_id: societyId } })).toBe(0);
    expect(await balance(ids.general)).toBe('100000.00');
    expect(parse(await get(`/payroll/${run.id}`).expect(200)).status).toBe('approved');

    await opening(ids.mosque, '5000');
    run = parse(await send('post', `/payroll/${run.id}/pay`).send({ account: 'cash', headId: ids.salaries }).expect(200));
    expect(run).toMatchObject({ status: 'paid', paidAccount: 'cash', expenseHead: { id: ids.salaries } });
    expect(run.expenses).toHaveLength(2);
    const expenses = await prisma.expenses.findMany({ where: { society_id: societyId }, orderBy: { amount: 'desc' } });
    expect(expenses.map((e) => [e.fund_id, e.amount.toFixed(2), e.status])).toEqual([
      [ids.general, '22225.00', 'paid'],
      [ids.mosque, '4500.30', 'paid'],
    ]);
    expect(expenses.every((e) => e.requested_by === users.clerk.id && e.approved_by === users.approver.id && e.voucher_no)).toBe(true);
    expect(await balance(ids.general)).toBe('77775.00');
    expect(await balance(ids.mosque)).toBe('599.70');

    // The expenses go with the run, not on their own.
    expect((await request(server()).post(`/expenses/${expenses[0]!.id}/void`).set('Cookie', users.admin.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF).send({ reason: 'ভুল' }).expect(409)).body.code).toBe(
      'expense_from_payroll',
    );
    const sheet = payslipSheetSchema.parse((await get(`/payroll/${run.id}/payslips/${slipOf(run, ids.salma).id}/sheet`, users.viewer).expect(200)).body);
    expect(sheet).toMatchObject({ month: MONTH, status: 'paid', period: { from: aug(21), to: aug(31) }, payslip: { net: '4500.30' } });
  });

  it('voids a paid run with its expenses, and the month can be prepared again', async () => {
    expect((await send('post', `/payroll/${run.id}/void`, users.approver).send({ reason: 'ভুল হিসাব' }).expect(403)).body.code).toBe('void_needs_expenses');
    run = parse(await send('post', `/payroll/${run.id}/void`, users.auditor).send({ reason: 'ভুল হিসাব' }).expect(200));
    expect(run).toMatchObject({ status: 'void', voidReason: 'ভুল হিসাব' });
    expect((await prisma.expenses.findMany({ where: { society_id: societyId } })).every((e) => e.status === 'void')).toBe(true);
    expect(await balance(ids.general)).toBe('100000.00');
    expect(await balance(ids.mosque)).toBe('5100.00');
    expect((await send('post', `/payroll/${run.id}/void`, users.auditor).send({ reason: 'আবার' }).expect(409)).body.code).toBe('payroll_void');

    const again = parse(await send('post', '/payroll').send({ month: MONTH }).expect(201));
    expect(again.id).not.toBe(run.id);
    // A new draft starts from scratch: everyone on the default fund, no lines.
    expect(slipOf(again, ids.salma)).toMatchObject({ net: '3548.39', fund: { id: ids.general } });
    const view = payrollMonthSchema.parse((await get(`/payroll?month=${MONTH}`).expect(200)).body);
    expect(view.run?.id).toBe(again.id);
    expect(view.voided).toEqual([expect.objectContaining({ id: run.id, voidReason: 'ভুল হিসাব', net: '26725.30' })]);
    // A draft is voided without touching expenses.
    expect(parse(await send('post', `/payroll/${again.id}/void`, users.approver).send({ reason: 'পরে' }).expect(200)).status).toBe('void');
  });

  it('keeps other societies out', async () => {
    await get(`/payroll/${ids.otherRun}`, users.admin).expect(404);
    await send('post', `/payroll/${ids.otherRun}/approve`, users.admin).expect(404);
    await send('post', `/payroll/${ids.otherRun}/void`, users.admin).send({ reason: 'x' }).expect(404);
    await get(`/payroll?month=${MONTH}`, users.viewer).expect(200);
  });
});
