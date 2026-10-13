import { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  CSRF_HEADER,
  DEFAULT_SLA_HOURS,
  overviewSchema,
  slaViewSchema,
  ticketDetailSchema,
  ticketListSchema,
  ticketStaffListSchema,
  type TicketDetail,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-helpdesk-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';
const HOUR = 3_600_000;

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const png = () => sharp({ create: { width: 32, height: 24, channels: 3, background: '#3a8' } }).png().toBuffer();
const hoursBetween = (from: string, to: string) => (new Date(to).getTime() - new Date(from).getTime()) / HOUR;

type Caller = { cookie: string; id: string };
type Grant = [permissions: string[], scope: string | null];

/**
 * Tickets, in a society of its own. The sector holds Block C and Block D. A guard is posted at
 * the sector, Kalam in Block C and Jamal in Block D. The Block C office opens and works on
 * Block C tickets; its supervisor may only look; the admin holds everything.
 */
describe('Helpdesk tickets (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'officeC' | 'supervisorC' | 'nobody', Caller>;
  const ids = {} as Record<'sector' | 'blockC' | 'blockD' | 'guard' | 'kalam' | 'jamal' | 'person' | 'otherTicket', string>;
  const ticket = {} as Record<'garbage' | 'light' | 'drain', TicketDetail>;

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

  const send = (method: 'post' | 'patch' | 'put', url: string, caller = users.admin) =>
    request(server())[method](url).set('Cookie', caller.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, caller = users.admin) => request(server()).get(url).set('Cookie', caller.cookie);
  const detail = (res: request.Response) => ticketDetailSchema.parse(res.body);
  const list = async (query: string, caller = users.admin) => ticketListSchema.parse((await get(`/tickets?${query}`, caller).expect(200)).body);
  const status = (id: string, body: object, caller = users.admin) => send('post', `/tickets/${id}/status`, caller).send(body);

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
        data: { society_id: societyId, person_id: person.id, staff_no: staffNo, designation_bn: 'প্রহরী', kind: 'permanent', posted_location_id: post, joined_on: day('2026-01-01') },
      });
      return row.id;
    };
    ids.guard = await worker('সেক্টর প্রহরী', 1, ids.sector);
    ids.kalam = await worker('কালাম', 2, ids.blockC);
    ids.jamal = await worker('জামাল', 3, ids.blockD);
    ids.person = (await prisma.persons.create({ data: { society_id: societyId, full_name: 'রহিমা বেগম' } })).id;

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;
    const otherLevel = await prisma.location_levels.create({ data: { society_id: otherSocietyId, depth: 1, name_bn: 'ব্লক' } });
    const otherPlaceId = randomUUID();
    await prisma.locations.create({ data: { id: otherPlaceId, society_id: otherSocietyId, level_id: otherLevel.id, name: 'ব্লক এ', path: `/${otherPlaceId}/` } });
    ids.otherTicket = (
      await prisma.tickets.create({
        data: { society_id: otherSocietyId, ticket_no: 'T-0001', location_id: otherPlaceId, category: 'water', title: 'অন্য অভিযোগ', due_at: new Date() },
      })
    ).id;

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser([[everything, null]]);
    users.officeC = await makeUser([[['helpdesk:view', 'helpdesk:create', 'helpdesk:edit'], ids.blockC]]);
    users.supervisorC = await makeUser([[['helpdesk:view'], ids.blockC]]);
    users.nobody = await makeUser([]);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    await prisma.ticket_events.deleteMany({ where: { society_id: societies } });
    await prisma.tickets.deleteMany({ where: { society_id: societies } });
    await prisma.staff.deleteMany({ where: { society_id: societies } });
    await prisma.persons.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    for (const depth of [2, 1]) await prisma.locations.deleteMany({ where: { society_id: societies, location_levels: { depth } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  it('sets the hours per category with settings.edit only', async () => {
    const shown = slaViewSchema.parse((await get('/helpdesk/sla', users.supervisorC).expect(200)).body);
    expect(shown).toEqual({ hours: DEFAULT_SLA_HOURS, can: { edit: false } });
    const hours = { ...DEFAULT_SLA_HOURS, garbage: 10 };
    await send('put', '/helpdesk/sla', users.officeC).send(hours).expect(403);
    await send('put', '/helpdesk/sla').send({ ...hours, garbage: 0 }).expect(400);
    expect(slaViewSchema.parse((await send('put', '/helpdesk/sla').send(hours).expect(200)).body).hours.garbage).toBe(10);
    await get('/helpdesk/sla', users.nobody).expect(403);
  });

  it('opens tickets numbered T-NNNN, due after the category hours, in the caller area', async () => {
    const open = (body: object, caller = users.officeC) => send('post', '/tickets', caller).send(body);
    ticket.garbage = detail(
      await open({ locationId: ids.blockC, category: 'garbage', title: ' ময়লা নেওয়া হয়নি ', reporter: { kind: 'typed', name: 'করিম', phone: '০১৭১১-২২২৩৩৩' } }).expect(201),
    );
    expect(ticket.garbage).toMatchObject({
      ticketNo: 'T-0001',
      title: 'ময়লা নেওয়া হয়নি',
      status: 'open',
      priority: 'normal',
      reporter: { kind: 'typed', name: 'করিম', phone: '01711222333' },
      assignee: null,
      place: { id: ids.blockC },
      overdue: false,
    });
    expect(hoursBetween(ticket.garbage.createdAt, ticket.garbage.dueAt)).toBe(10);
    expect(ticket.garbage.events.map((event) => event.kind)).toEqual(['created']);

    ticket.light = detail(
      await open({ locationId: ids.blockC, category: 'street_light', title: 'বাতি নষ্ট', priority: 'high', assignedStaffId: ids.kalam }).expect(201),
    );
    expect(ticket.light).toMatchObject({ ticketNo: 'T-0002', status: 'assigned', assignee: { id: ids.kalam }, reporter: { kind: 'none' } });
    expect(hoursBetween(ticket.light.createdAt, ticket.light.dueAt)).toBe(72);

    // Outside Block C, or a staff member posted elsewhere, or someone not on record.
    expect((await open({ locationId: ids.blockD, category: 'water', title: 'পানি নেই' }).expect(404)).body.code).toBe('location_not_found');
    expect((await open({ locationId: ids.blockC, category: 'water', title: 'পানি নেই', assignedStaffId: ids.jamal }).expect(404)).body.code).toBe('staff_not_found');
    expect((await open({ locationId: ids.blockC, category: 'water', title: 'পানি নেই', reporter: { kind: 'person', personId: randomUUID() } }).expect(404)).body.code).toBe(
      'person_not_found',
    );
    await open({ locationId: ids.blockC, category: 'water', title: 'পানি নেই' }, users.supervisorC).expect(403);

    ticket.drain = detail(
      await open({ locationId: ids.blockD, category: 'drainage', title: 'ড্রেন বন্ধ', reporter: { kind: 'person', personId: ids.person } }, users.admin).expect(201),
    );
    expect(ticket.drain).toMatchObject({ ticketNo: 'T-0003', reporter: { kind: 'person', personId: ids.person, name: 'রহিমা বেগম' } });
    expect(await prisma.audit_logs.count({ where: { society_id: societyId, entity_type: 'ticket', action: 'create' } })).toBe(3);
  });

  it('keeps each office to its area and its staff', async () => {
    const seen = await list('view=all', users.officeC);
    expect(seen.items.map((row) => row.ticketNo).sort()).toEqual(['T-0001', 'T-0002']);
    expect(seen.can.create).toBe(true);
    await get(`/tickets/${ticket.drain.id}`, users.officeC).expect(404);
    await get(`/tickets/${ids.otherTicket}`).expect(404);
    await get('/tickets', users.nobody).expect(403);
    await send('patch', `/tickets/${ticket.garbage.id}`, users.supervisorC).send({ title: 'নতুন' }).expect(403);
    expect(detail(await get(`/tickets/${ticket.garbage.id}`, users.supervisorC).expect(200)).can).toEqual({ edit: false, photo: false, workOrder: false, statuses: [] });

    const staff = ticketStaffListSchema.parse((await get('/tickets/staff', users.officeC).expect(200)).body);
    expect(staff.items.map((row) => row.id)).toEqual([ids.guard, ids.kalam]);
    expect(ticketStaffListSchema.parse((await get('/tickets/staff', users.supervisorC).expect(200)).body).items).toEqual([]);
  });

  it('edits a ticket; a new category moves the due time from when it was opened', async () => {
    const edited = detail(await send('patch', `/tickets/${ticket.garbage.id}`, users.officeC).send({ category: 'security', priority: 'urgent' }).expect(200));
    expect(edited).toMatchObject({ category: 'security', priority: 'urgent' });
    expect(hoursBetween(edited.createdAt, edited.dueAt)).toBe(DEFAULT_SLA_HOURS.security);
    expect(edited.events.at(-1)).toMatchObject({ kind: 'updated', detail: { fields: ['category', 'priority'] } });
    expect((await send('patch', `/tickets/${ticket.garbage.id}`, users.officeC).send({ locationId: ids.blockD }).expect(404)).body.code).toBe('location_not_found');
  });

  it('assigns, resolves with a note, and leaves closing and reopening to the approver', async () => {
    const id = ticket.garbage.id;
    const assign = (staffId: string | null) => send('post', `/tickets/${id}/assign`, users.officeC).send({ staffId });
    expect(detail(await assign(ids.guard).expect(200))).toMatchObject({ status: 'assigned', assignee: { id: ids.guard } });
    expect((await assign(ids.guard).expect(409)).body.code).toBe('ticket_assignee_same');
    const back = detail(await assign(null).expect(200));
    expect(back).toMatchObject({ status: 'open', assignee: null });
    expect(back.events.at(-1)).toMatchObject({ kind: 'assigned', detail: { staff: null, from: 'assigned', to: 'open' } });

    expect(detail(await status(id, { status: 'in_progress' }, users.officeC).expect(200)).status).toBe('in_progress');
    await status(id, { status: 'resolved' }, users.officeC).expect(400);
    const resolved = detail(await status(id, { status: 'resolved', note: 'ময়লা সরানো হয়েছে' }, users.officeC).expect(200));
    expect(resolved).toMatchObject({ status: 'resolved', resolutionNote: 'ময়লা সরানো হয়েছে', can: { statuses: [] } });
    await status(id, { status: 'closed' }, users.officeC).expect(403);
    expect(detail(await get(`/tickets/${id}`).expect(200)).can.statuses).toEqual(['closed', 'in_progress']);

    // Reopened: the resolution goes; resolved again and closed by the approver.
    const reopened = detail(await status(id, { status: 'in_progress', note: 'আবার ময়লা' }).expect(200));
    expect(reopened).toMatchObject({ status: 'in_progress', resolvedAt: null, resolutionNote: null });
    await status(id, { status: 'resolved', note: 'আবার সরানো হয়েছে' }, users.officeC).expect(200);
    const closed = detail(await status(id, { status: 'closed' }).expect(200));
    expect(closed.status).toBe('closed');
    expect(closed.closedAt).not.toBeNull();
    expect(closed.can).toEqual({ edit: false, photo: false, workOrder: false, statuses: [] });

    expect((await status(id, { status: 'in_progress' }).expect(409)).body.code).toBe('ticket_status_invalid');
    expect((await status(id, { status: 'closed' }).expect(409)).body.code).toBe('ticket_status_same');
    expect((await send('patch', `/tickets/${id}`, users.officeC).send({ title: 'নতুন' }).expect(409)).body.code).toBe('ticket_finished');
    expect((await send('post', `/tickets/${id}/comments`, users.officeC).send({ note: 'দেখা' }).expect(409)).body.code).toBe('ticket_finished');

    // Cancelling says why and needs the approver.
    await status(ticket.drain.id, { status: 'cancelled' }).expect(400);
    await status(ticket.drain.id, { status: 'cancelled', note: 'ভুল করে খোলা' }).expect(200);
    const statuses = closed.events.filter((event) => event.kind === 'status').map((event) => `${event.detail.from}>${event.detail.to}`);
    expect(statuses).toEqual(['open>in_progress', 'in_progress>resolved', 'resolved>in_progress', 'in_progress>resolved', 'resolved>closed']);
  });

  it('adds comments and up to five photos to the timeline', async () => {
    const id = ticket.light.id;
    const commented = detail(await send('post', `/tickets/${id}/comments`, users.officeC).send({ note: ' খুঁটি দেখা হয়েছে ' }).expect(200));
    expect(commented.events.at(-1)).toMatchObject({ kind: 'comment', note: 'খুঁটি দেখা হয়েছে', by: { id: users.officeC.id } });

    const withPhoto = detail(await send('post', `/tickets/${id}/photos`, users.officeC).attach('file', await png(), 'pole.png').expect(200));
    expect(withPhoto.events.at(-1)?.kind).toBe('photo');
    expect(withPhoto.can.photo).toBe(true);
    const key = (await prisma.ticket_events.findFirstOrThrow({ where: { ticket_id: id, kind: 'photo' } })).photo_url!;
    expect(key.startsWith(`${societyId}/tickets/`)).toBe(true);

    await prisma.ticket_events.createMany({ data: [1, 2, 3, 4].map((n) => ({ society_id: societyId, ticket_id: id, kind: 'photo', photo_url: `${key}?${n}` })) });
    expect(detail(await get(`/tickets/${id}`).expect(200)).can.photo).toBe(false);
    expect((await send('post', `/tickets/${id}/photos`, users.officeC).attach('file', await png(), 'more.png').expect(409)).body.code).toBe('ticket_photo_limit');
    await send('post', `/tickets/${id}/photos`, users.supervisorC).attach('file', await png(), 'more.png').expect(403);
  });

  it('lists by view with counts, and finds by number or phone in either digit form', async () => {
    await prisma.tickets.update({ where: { id: ticket.light.id }, data: { due_at: new Date(Date.now() - HOUR) } });
    const active = await list('');
    expect(active.items.map((row) => row.ticketNo)).toEqual(['T-0002']);
    expect(active.items[0]).toMatchObject({ overdue: true, priority: 'high' });
    expect(active.counts).toEqual({ active: 1, overdue: 1, dueToday: 0, resolvedWeek: 1 });
    expect((await list('view=overdue')).total).toBe(1);
    expect((await list('view=finished')).items.map((row) => row.ticketNo).sort()).toEqual(['T-0001', 'T-0003']);

    expect((await list('view=all&q=T-০০০১')).items.map((row) => row.ticketNo)).toEqual(['T-0001']);
    expect((await list('view=all&q=3')).items.map((row) => row.ticketNo)).toEqual(['T-0003']);
    expect((await list('view=all&q=২২২৩৩৩')).items.map((row) => row.ticketNo)).toEqual(['T-0001']);
    expect((await list('view=all&q=রহিমা')).items.map((row) => row.ticketNo)).toEqual(['T-0003']);
    expect((await list(`view=all&staffId=${ids.kalam}`)).items.map((row) => row.ticketNo)).toEqual(['T-0002']);
    expect((await list(`view=all&locationId=${ids.blockD}`)).items.map((row) => row.ticketNo)).toEqual(['T-0003']);
    expect((await list('view=all&category=street_light', users.officeC)).total).toBe(1);

    const overview = overviewSchema.parse((await get('/overview', users.officeC).expect(200)).body);
    expect(overview.helpdesk).toMatchObject({ active: 1, overdue: 1, items: [{ ticketNo: 'T-0002', overdue: true }] });
    expect(overviewSchema.parse((await get('/overview', users.nobody).expect(200)).body).helpdesk).toBeNull();
  });
});
