import { INestApplication } from '@nestjs/common';
import {
  addDays,
  AUTH_COOKIES,
  CSRF_HEADER,
  monthsAfter,
  SETTING_KEYS,
  ticketDetailSchema,
  workOrderDetailSchema,
  workOrderListSchema,
  type WorkOrderDetail,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-work-orders-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dhakaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

type Caller = { cookie: string; id: string };
type Grant = [permissions: string[], scope: string | null];

/**
 * Work orders, in a society of its own. The sector holds Block C and Block D; Kalam works in
 * Block C, Jamal in Block D. The Block C office raises and works on jobs there but may not
 * spend; its clerk may also request expenses. A pump at the Block C mosque (its own fund) has
 * a three-monthly service plan, and a street light ticket is open in Block C.
 */
describe('Work orders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'officeC' | 'clerkC' | 'nobody', Caller>;
  const ids = {} as Record<
    'sector' | 'blockC' | 'blockD' | 'kalam' | 'jamal' | 'vendor' | 'head' | 'fund' | 'pump' | 'plan' | 'ticket' | 'ticketD' | 'otherOrder',
    string
  >;
  const order = {} as Record<'light' | 'service', WorkOrderDetail>;
  const today = dhakaToday();

  async function makeUser(grants: Grant[]): Promise<Caller> {
    const rows = await prisma.permissions.findMany();
    const user = await prisma.users.create({ data: { society_id: societyId, phone: randomPhone(), status: 'active' } });
    for (const [permissions, scope] of grants) {
      const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
      await prisma.role_permissions.createMany({
        data: permissions.map((name) => ({ role_id: role.id, permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id })),
      });
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id, scope_location_id: scope } });
    }
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}`, id: user.id };
  }

  const send = (method: 'post' | 'patch', url: string, caller = users.admin) =>
    request(server())[method](url).set('Cookie', caller.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, caller = users.admin) => request(server()).get(url).set('Cookie', caller.cookie);
  const detail = (res: request.Response) => workOrderDetailSchema.parse(res.body);
  const raise = (body: object, caller = users.officeC) => send('post', '/work-orders', caller).send(body);
  const list = async (query: string, caller = users.admin) => workOrderListSchema.parse((await get(`/work-orders?${query}`, caller).expect(200)).body);

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);

    const level = (depth: number, name_bn: string) => prisma.location_levels.create({ data: { society_id: societyId, depth, name_bn } }).then((r) => r.id);
    const sectorLevel = await level(1, 'সেক্টর');
    const blockLevel = await level(2, 'ব্লক');
    const place = async (levelId: string, name: string, parent: { id: string; path: string } | null) => {
      const id = randomUUID();
      const path = `${parent?.path ?? '/'}${id}/`;
      await prisma.locations.create({ data: { id, society_id: societyId, level_id: levelId, parent_id: parent?.id ?? null, name, path } });
      return { id, path };
    };
    const sector = await place(sectorLevel, 'সেক্টর ১৫', null);
    ids.sector = sector.id;
    ids.blockC = (await place(blockLevel, 'ব্লক সি', sector)).id;
    ids.blockD = (await place(blockLevel, 'ব্লক ডি', sector)).id;

    const worker = async (name: string, staffNo: number, post: string) => {
      const person = await prisma.persons.create({ data: { society_id: societyId, full_name: name } });
      const row = await prisma.staff.create({
        data: { society_id: societyId, person_id: person.id, staff_no: staffNo, designation_bn: 'মিস্ত্রি', kind: 'permanent', posted_location_id: post, joined_on: day('2026-01-01') },
      });
      return row.id;
    };
    ids.kalam = await worker('কালাম', 1, ids.blockC);
    ids.jamal = await worker('জামাল', 2, ids.blockD);

    await prisma.funds.create({ data: { society_id: societyId, name_bn: 'সাধারণ তহবিল', is_default: true } });
    ids.fund = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'মসজিদ তহবিল' } })).id;
    await prisma.society_settings.create({ data: { society_id: societyId, key: SETTING_KEYS.separateFacilityFunds, value: true } });
    ids.vendor = (await prisma.vendors.create({ data: { society_id: societyId, name: 'আলম ইলেকট্রিক' } })).id;
    ids.head = (await prisma.expense_heads.create({ data: { society_id: societyId, name_bn: 'মেরামত' } })).id;

    const mosque = await prisma.facilities.create({ data: { society_id: societyId, location_id: ids.blockC, name_bn: 'মসজিদ', kind: 'mosque', fund_id: ids.fund } });
    ids.pump = (
      await prisma.assets.create({ data: { society_id: societyId, asset_no: 'AST-0001', name_bn: 'পানির পাম্প', category: 'পাম্প', facility_id: mosque.id, location_id: ids.blockC } })
    ).id;
    ids.plan = (
      await prisma.asset_maintenance_plans.create({
        data: { society_id: societyId, asset_id: ids.pump, task_bn: 'পাম্প সার্ভিস', every_months: 3, next_due_on: day(addDays(today, 5)) },
      })
    ).id;
    const ticket = (location_id: string, ticket_no: string) =>
      prisma.tickets.create({ data: { society_id: societyId, ticket_no, location_id, category: 'street_light', title: 'বাতি নষ্ট', due_at: new Date() } }).then((r) => r.id);
    ids.ticket = await ticket(ids.blockC, 'T-0001');
    ids.ticketD = await ticket(ids.blockD, 'T-0002');

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;
    const otherLevel = await prisma.location_levels.create({ data: { society_id: otherSocietyId, depth: 1, name_bn: 'ব্লক' } });
    const otherPlaceId = randomUUID();
    await prisma.locations.create({ data: { id: otherPlaceId, society_id: otherSocietyId, level_id: otherLevel.id, name: 'ব্লক এ', path: `/${otherPlaceId}/` } });
    ids.otherOrder = (await prisma.work_orders.create({ data: { society_id: otherSocietyId, wo_no: 'WO-26-0001', location_id: otherPlaceId, title: 'অন্য কাজ' } })).id;

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    const office: string[] = ['work_orders:view', 'work_orders:create', 'work_orders:edit', 'helpdesk:view', 'facilities:view'];
    users.admin = await makeUser([[everything, null]]);
    users.officeC = await makeUser([[office, ids.blockC]]);
    users.clerkC = await makeUser([
      [office, ids.blockC],
      [['expenses:view', 'expenses:create'], null],
    ]);
    users.nobody = await makeUser([]);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    await prisma.work_orders.deleteMany({ where: { society_id: societies } });
    await prisma.expenses.deleteMany({ where: { society_id: societies } });
    await prisma.expense_heads.deleteMany({ where: { society_id: societies } });
    await prisma.ticket_events.deleteMany({ where: { society_id: societies } });
    await prisma.tickets.deleteMany({ where: { society_id: societies } });
    await prisma.asset_events.deleteMany({ where: { society_id: societies } });
    await prisma.asset_maintenance_plans.deleteMany({ where: { society_id: societies } });
    await prisma.assets.deleteMany({ where: { society_id: societies } });
    await prisma.facilities.deleteMany({ where: { society_id: societies } });
    await prisma.vendors.deleteMany({ where: { society_id: societies } });
    await prisma.funds.deleteMany({ where: { society_id: societies } });
    await prisma.staff.deleteMany({ where: { society_id: societies } });
    await prisma.persons.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    for (const depth of [2, 1]) await prisma.locations.deleteMany({ where: { society_id: societies, location_levels: { depth } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  it('raises a work order on a ticket, at its place, and notes it on the ticket', async () => {
    order.light = detail(await raise({ ticketId: ids.ticket, title: 'বাতি বদলানো', staffId: ids.kalam, estimatedCost: '৫০০' }).expect(201));
    expect(order.light.woNo).toMatch(/^WO-\d{2}-0001$/);
    expect(order.light).toMatchObject({
      status: 'open',
      source: 'ticket',
      place: { id: ids.blockC },
      staff: { id: ids.kalam },
      vendor: null,
      estimatedCost: '500.00',
      ticket: { id: ids.ticket, ticketNo: 'T-0001', open: true },
      can: { edit: true, statuses: ['in_progress', 'done'], cost: false },
    });

    const ticket = ticketDetailSchema.parse((await get(`/tickets/${ids.ticket}`).expect(200)).body);
    expect(ticket.workOrders).toEqual([{ id: order.light.id, woNo: order.light.woNo, title: 'বাতি বদলানো', status: 'open' }]);
    expect(ticket.events.at(-1)).toMatchObject({ kind: 'work_order', detail: { workOrderNo: order.light.woNo, workOrderStatus: 'open' } });

    expect((await raise({ ticketId: ids.ticketD, title: 'বাতি' }).expect(404)).body.code).toBe('ticket_not_found');
    expect((await raise({ locationId: ids.blockD, title: 'কাজ' }).expect(404)).body.code).toBe('location_not_found');
    expect((await raise({ locationId: ids.blockC, title: 'কাজ', staffId: ids.jamal }).expect(404)).body.code).toBe('staff_not_found');
    await raise({ locationId: ids.blockC, title: 'কাজ', staffId: ids.kalam, vendorId: ids.vendor }).expect(400);
    await raise({ title: 'কাজ' }).expect(400);
    await raise({ locationId: ids.blockC, title: 'কাজ' }, users.nobody).expect(403);
  });

  it('raises an upkeep job from a plan, which brings its asset', async () => {
    expect((await raise({ planId: ids.plan, assetId: randomUUID(), title: 'সার্ভিস' }).expect(400)).body.code).toBe('plan_asset_mismatch');
    order.service = detail(await raise({ planId: ids.plan, title: 'পাম্প সার্ভিস', vendorId: ids.vendor }).expect(201));
    expect(order.service).toMatchObject({ source: 'plan', asset: { id: ids.pump, assetNo: 'AST-0001', open: true }, plan: { id: ids.plan }, vendor: { id: ids.vendor } });
    expect(order.service.woNo).toMatch(/-0002$/);
    const event = await prisma.asset_events.findFirstOrThrow({ where: { asset_id: ids.pump, kind: 'work_order' } });
    expect(event.detail).toEqual({ workOrderNo: order.service.woNo });
  });

  it('edits the job; giving it to staff takes it from the vendor', async () => {
    const edited = detail(await send('patch', `/work-orders/${order.service.id}`, users.officeC).send({ staffId: ids.kalam, title: 'পাম্প সার্ভিস ও তেল' }).expect(200));
    expect(edited).toMatchObject({ staff: { id: ids.kalam }, vendor: null, title: 'পাম্প সার্ভিস ও তেল' });
    const back = detail(await send('patch', `/work-orders/${order.service.id}`, users.officeC).send({ vendorId: ids.vendor }).expect(200));
    expect(back).toMatchObject({ staff: null, vendor: { id: ids.vendor } });
  });

  it('finishes without a cost, and tells the ticket', async () => {
    const id = order.light.id;
    expect(detail(await send('post', `/work-orders/${id}/start`, users.officeC).expect(200)).status).toBe('in_progress');
    expect((await send('post', `/work-orders/${id}/start`, users.officeC).expect(409)).body.code).toBe('work_order_status_invalid');
    const done = (body: object, caller = users.officeC) => send('post', `/work-orders/${id}/done`, caller).send(body);
    expect((await done({ completedOn: addDays(today, 1), note: 'বাতি বদলানো হয়েছে' }).expect(400)).body.code).toBe('future_date');
    await done({ completedOn: today, note: 'বদলানো', cost: '300' }).expect(400);
    await done({ completedOn: today, note: 'বদলানো', cost: '300', headId: ids.head }).expect(403);

    const finished = detail(await done({ completedOn: today, note: 'বাতি বদলানো হয়েছে' }).expect(200));
    expect(finished).toMatchObject({ status: 'done', completedOn: today, completionNote: 'বাতি বদলানো হয়েছে', expense: null, can: { edit: false, statuses: [] } });
    const ticket = ticketDetailSchema.parse((await get(`/tickets/${ids.ticket}`).expect(200)).body);
    expect(ticket.events.at(-1)).toMatchObject({ kind: 'work_order', note: 'বাতি বদলানো হয়েছে', detail: { workOrderStatus: 'done' } });
    expect(ticket.status).toBe('open');

    expect((await send('patch', `/work-orders/${id}`, users.officeC).send({ title: 'নতুন' }).expect(409)).body.code).toBe('work_order_finished');
    expect((await send('post', `/work-orders/${id}/cancel`).send({ reason: 'ভুল' }).expect(409)).body.code).toBe('work_order_status_invalid');
  });

  it('finishes an upkeep job with a cost: a pending expense from the facility fund, and the plan moves on', async () => {
    const before = await prisma.ledger_entries.count({ where: { society_id: societyId } });
    const finished = detail(
      await send('post', `/work-orders/${order.service.id}/done`, users.clerkC).send({ completedOn: today, note: 'সার্ভিস হয়েছে', cost: '১২০০', headId: ids.head }).expect(200),
    );
    expect(finished.expense).toMatchObject({ amount: '1200.00', status: 'pending', open: true });
    const expense = await prisma.expenses.findUniqueOrThrow({ where: { id: finished.expense!.id } });
    expect(expense).toMatchObject({ status: 'pending', fund_id: ids.fund, vendor_id: ids.vendor, expense_head_id: ids.head, description: `${order.service.woNo}: পাম্প সার্ভিস ও তেল` });
    expect(expense.spent_on.toISOString().slice(0, 10)).toBe(today);
    expect(await prisma.ledger_entries.count({ where: { society_id: societyId } })).toBe(before);

    const plan = await prisma.asset_maintenance_plans.findUniqueOrThrow({ where: { id: ids.plan } });
    expect(plan.last_done_on?.toISOString().slice(0, 10)).toBe(today);
    expect(plan.next_due_on.toISOString().slice(0, 10)).toBe(monthsAfter(today, 3));
    expect(await prisma.asset_events.count({ where: { asset_id: ids.pump, kind: 'maintenance' } })).toBe(1);
  });

  it('leaves cancelling to the approver', async () => {
    const job = detail(await raise({ ticketId: ids.ticket, title: 'খুঁটি রং' }).expect(201));
    await send('post', `/work-orders/${job.id}/cancel`, users.officeC).send({ reason: 'দরকার নেই' }).expect(403);
    await send('post', `/work-orders/${job.id}/cancel`).send({}).expect(400);
    const cancelled = detail(await send('post', `/work-orders/${job.id}/cancel`).send({ reason: 'দরকার নেই' }).expect(200));
    expect(cancelled).toMatchObject({ status: 'cancelled', cancelReason: 'দরকার নেই' });
    expect(cancelled.cancelledAt).not.toBeNull();
  });

  it('lists by view, source and number, within the area', async () => {
    const elsewhere = detail(await raise({ locationId: ids.blockD, title: 'ড্রেন পরিষ্কার' }, users.admin).expect(201));
    expect((await list('')).items.map((row) => row.id)).toEqual([elsewhere.id]);
    expect((await list('')).counts).toEqual({ open: 1, inProgress: 0 });
    expect((await list('view=done')).total).toBe(2);
    expect((await list('view=cancelled')).total).toBe(1);
    expect((await list('view=all&source=plan')).items.map((row) => row.id)).toEqual([order.service.id]);
    expect((await list(`view=all&ticketId=${ids.ticket}`)).total).toBe(2);

    const period = order.light.woNo.slice(3, 5);
    expect((await list(`view=all&q=WO-${period}-০০০১`)).items.map((row) => row.id)).toEqual([order.light.id]);
    expect((await list('view=all&q=2')).items.map((row) => row.id)).toEqual([order.service.id]);
    expect((await list('view=all&q=ড্রেন')).items.map((row) => row.id)).toEqual([elsewhere.id]);

    const office = await list('view=all', users.officeC);
    expect(office.items.map((row) => row.id)).not.toContain(elsewhere.id);
    await get(`/work-orders/${elsewhere.id}`, users.officeC).expect(404);
    await get(`/work-orders/${ids.otherOrder}`).expect(404);
    await get('/work-orders', users.nobody).expect(403);
  });
});
