import { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  CSRF_HEADER,
  directoryListSchema,
  directoryPrintSchema,
  locationPeopleSchema,
  moveDetailSchema,
  moveListSchema,
  tenancySchema,
  type MoveDetail,
  type Tenancy,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { isoDate, todayDate } from './../src/common/dates.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-mov-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const today = () => isoDate(todayDate());
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type Caller = { cookie: string; id: string };

/**
 * Move-in and move-out checklists and the resident directory, in a society of their own.
 * Sector 15 holds Block C (road C-1 with flats C1, C2, C3) and Block D (flat D1).
 */
describe('Moves and resident directory (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'officeC' | 'approverC' | 'viewerD' | 'exporter' | 'nobody', Caller>;
  const ids = {} as Record<'sector' | 'blockC' | 'blockD' | 'roadC1' | 'c1' | 'c2' | 'c3' | 'd1' | 'fund' | 'owner' | 'otherUnit', string>;
  const ownerPhone = randomPhone();

  async function makeUser(permissions: string[], scope: string | null = null): Promise<Caller> {
    const rows = await prisma.permissions.findMany();
    const user = await prisma.users.create({ data: { society_id: societyId, phone: randomPhone(), status: 'active' } });
    if (permissions.length) {
      const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
      await prisma.role_permissions.createMany({
        data: permissions.map((name) => ({ role_id: role.id, permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id })),
      });
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id, scope_location_id: scope } });
    }
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}`, id: user.id };
  }

  const send = (method: 'post' | 'patch' | 'delete', url: string, caller = users.admin) =>
    request(server())[method](url).set('Cookie', caller.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, caller = users.admin) => request(server()).get(url).set('Cookie', caller.cookie);

  const rent = async (unitId: string, name: string, phone: string, status: 'pending' | 'active' = 'pending'): Promise<Tenancy> =>
    tenancySchema.parse(
      (
        await send('post', '/tenancies')
          .send({ unitId, renter: { kind: 'person', person: { fullName: name, phone } }, renterType: 'family', status, startDate: '2026-01-01' })
          .expect(201)
      ).body,
    );
  const start = async (tenancyId: string, kind: 'move_in' | 'move_out', caller = users.admin, expected = 201) =>
    send('post', '/moves', caller).send({ tenancyId, kind, plannedDate: today() }).expect(expected);
  const detail = (body: unknown): MoveDetail => moveDetailSchema.parse(body);
  const occupancy = async (unitId: string) => (await prisma.units.findUniqueOrThrow({ where: { location_id: unitId } })).occupancy;
  const tenancyStatus = async (id: string) => (await prisma.tenancies.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);

    const level = (depth: number, name_bn: string, is_unit_level = false) =>
      prisma.location_levels.create({ data: { society_id: societyId, depth, name_bn, is_unit_level } }).then((r) => r.id);
    const sectorLevel = await level(1, 'সেক্টর');
    const blockLevel = await level(2, 'ব্লক');
    const roadLevel = await level(3, 'রোড');
    const flatLevel = await level(4, 'ইউনিট', true);
    const place = async (levelId: string, name: string, parent: { id: string; path: string } | null, society = societyId) => {
      const id = randomUUID();
      const path = `${parent?.path ?? '/'}${id}/`;
      await prisma.locations.create({ data: { id, society_id: society, level_id: levelId, parent_id: parent?.id ?? null, name, path } });
      return { id, path };
    };
    const unit = async (name: string, parent: { id: string; path: string }) => {
      const row = await place(flatLevel, name, parent);
      await prisma.units.create({ data: { location_id: row.id, society_id: societyId, unit_type: 'residential' } });
      return row.id;
    };
    const sector = await place(sectorLevel, 'সেক্টর ১৫', null);
    const c = await place(blockLevel, 'ব্লক সি', sector);
    const d = await place(blockLevel, 'ব্লক ডি', sector);
    const road = await place(roadLevel, 'রোড সি-১', c);
    Object.assign(ids, { sector: sector.id, blockC: c.id, blockD: d.id, roadC1: road.id });
    // Natural order: C-2 before C-10.
    ids.c1 = await unit('সি-১০', road);
    ids.c2 = await unit('সি-২', road);
    ids.c3 = await unit('সি-৩', road);
    ids.d1 = await unit('ডি-১', d);
    ids.fund = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'সাধারণ তহবিল', is_default: true } })).id;

    // C3's owner lives there, with an active society membership.
    ids.owner = (await prisma.persons.create({ data: { society_id: societyId, full_name: 'মালিক সাহেব', phone: ownerPhone, nid: '1234567890' } })).id;
    await prisma.ownerships.create({ data: { society_id: societyId, location_id: ids.c3, person_id: ids.owner, start_date: day('2020-01-01') } });
    await prisma.occupants.create({ data: { society_id: societyId, unit_id: ids.c3, person_id: ids.owner, relation: 'head', start_date: day('2020-01-01') } });
    await prisma.memberships.create({ data: { society_id: societyId, person_id: ids.owner, member_no: 7, joined_on: day('2021-01-01') } });

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    users.officeC = await makeUser(['tenancies:view', 'tenancies:create', 'tenancies:edit', 'members:view', 'billing:view'], ids.blockC);
    users.approverC = await makeUser(['tenancies:view', 'tenancies:edit', 'tenancies:approve'], ids.blockC);
    users.viewerD = await makeUser(['tenancies:view', 'members:view'], ids.blockD);
    users.exporter = await makeUser(['members:view', 'members:export']);
    users.nobody = await makeUser([]);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    await prisma.move_events.deleteMany({ where: { society_id: societies } });
    await prisma.occupants.deleteMany({ where: { society_id: societies } });
    await prisma.tenancies.deleteMany({ where: { society_id: societies } });
    await prisma.memberships.deleteMany({ where: { society_id: societies } });
    await prisma.invoices.deleteMany({ where: { society_id: societies } });
    await prisma.ownerships.deleteMany({ where: { society_id: societies } });
    await prisma.persons.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    for (const depth of [4, 3, 2, 1]) await prisma.locations.deleteMany({ where: { society_id: societies, location_levels: { depth } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  describe('move-in', () => {
    it('turns a pending tenancy active on the day it is done, with its household and the unit rented', async () => {
      const tenancy = await rent(ids.c1, 'রাশেদ হোসেন', randomPhone());
      expect(await occupancy(ids.c1)).toBe('vacant');
      const made = detail((await start(tenancy.id, 'move_in', users.officeC)).body);
      expect(made).toMatchObject({ kind: 'move_in', status: 'open', plannedDate: today(), checked: 0, checks: 4, can: { edit: true, complete: true, overrideDues: false } });
      expect(made.checklist.map((item) => item.key)).toEqual(['nid', 'agreement', 'police_form', 'photo']);

      // The tenancy row shows the move under way, and its status can't be changed around it.
      const people = locationPeopleSchema.parse((await get(`/locations/${ids.c1}/people`).expect(200)).body);
      expect(people.tenancies![0]!.openMove).toEqual({ id: made.id, kind: 'move_in' });
      expect((await send('patch', `/tenancies/${tenancy.id}`).send({ status: 'active' }).expect(409)).body.code).toBe('move_open');
      expect((await start(tenancy.id, 'move_in', users.officeC, 409)).body.code).toBe('move_open_exists');

      // Ticking the police form also records it on the tenancy; the other kind's keys are refused.
      const ticked = detail(
        (await send('patch', `/moves/${made.id}`, users.officeC).send({ checklist: { nid: true, police_form: true }, note: 'চুক্তি পরে দেবেন' }).expect(200)).body,
      );
      expect([ticked.checked, ticked.note, ticked.tenancy.policeFormSubmitted]).toEqual([2, 'চুক্তি পরে দেবেন', true]);
      expect((await send('patch', `/moves/${made.id}`, users.officeC).send({ checklist: { keys: true } }).expect(400)).body.code).toBe('invalid_check');

      const done = detail((await send('post', `/moves/${made.id}/complete`, users.officeC).send({ date: '2026-02-01' }).expect(200)).body);
      expect(done).toMatchObject({ status: 'done', completedBy: { id: users.officeC.id }, tenancy: { status: 'active', startDate: '2026-02-01' }, can: { edit: false } });
      expect(await occupancy(ids.c1)).toBe('rented');
      const head = await prisma.occupants.findFirstOrThrow({ where: { tenancy_id: tenancy.id } });
      expect(isoDate(head.start_date)).toBe('2026-02-01');
      expect((await send('post', `/moves/${made.id}/complete`, users.officeC).send({ date: '2026-02-01' }).expect(409)).body.code).toBe('move_closed');
      expect(await prisma.audit_logs.count({ where: { entity_type: 'move_event', entity_id: made.id } })).toBe(3);
    });

    it('needs a pending tenancy, and a cancelled move-in leaves it pending', async () => {
      const tenancy = await rent(ids.c2, 'করিম মিয়া', randomPhone(), 'active');
      expect((await start(tenancy.id, 'move_in', users.admin, 409)).body.code).toBe('move_wrong_status');
      await send('post', `/tenancies/${tenancy.id}/end`).send({ endDate: today() }).expect(200);

      const pending = await rent(ids.c2, 'সালমা খাতুন', randomPhone());
      const made = detail((await start(pending.id, 'move_in')).body);
      const cancelled = detail((await send('post', `/moves/${made.id}/cancel`).expect(200)).body);
      expect(cancelled).toMatchObject({ status: 'cancelled', cancelledBy: { id: users.admin.id }, tenancy: { status: 'pending' } });
      await send('post', `/moves/${made.id}/cancel`).expect(409);
      // Ending the tenancy directly cancels a move still open for it.
      const again = detail((await start(pending.id, 'move_in')).body);
      await send('post', `/tenancies/${pending.id}/end`).send({ endDate: today() }).expect(200);
      expect(detail((await get(`/moves/${again.id}`).expect(200)).body).status).toBe('cancelled');
    });
  });

  describe('move-out', () => {
    let tenancy: Tenancy;
    let move: MoveDetail;

    it('marks the tenancy moving out, and is held back by unpaid bills', async () => {
      tenancy = await rent(ids.c2, 'নাসরিন সুলতানা', randomPhone(), 'active');
      move = detail((await start(tenancy.id, 'move_out', users.officeC)).body);
      expect(await tenancyStatus(tenancy.id)).toBe('moving_out');
      expect(await occupancy(ids.c2)).toBe('rented');

      await prisma.invoices.create({
        data: { society_id: societyId, invoice_no: `${MARK}-1`, unit_id: ids.c2, bill_to_person_id: ids.owner, fund_id: ids.fund, due_date: day(today()), total: '1500.25', paid: '500.10', status: 'partial' },
      });
      const seen = detail((await get(`/moves/${move.id}`, users.officeC).expect(200)).body);
      expect(seen.dues).toEqual({ owed: '1000.15', bills: 1 });
      // Without billing.view the dues stay hidden, but they still hold the move back.
      expect(detail((await get(`/moves/${move.id}`, users.approverC).expect(200)).body).dues).toBeNull();
      const held = await send('post', `/moves/${move.id}/complete`, users.officeC).send({ date: today() }).expect(409);
      expect(held.body).toMatchObject({ code: 'dues_outstanding', details: { owed: '1000.15' } });
    });

    it('ends the tenancy and its household with tenancies.approve, recording the dues as not cleared', async () => {
      await send('post', `/moves/${move.id}/complete`, users.approverC).send({ date: '2025-12-31' }).expect(400);
      const done = detail((await send('post', `/moves/${move.id}/complete`, users.approverC).send({ date: today() }).expect(200)).body);
      expect(done).toMatchObject({ status: 'done', duesCleared: false, tenancy: { status: 'ended', endDate: today() } });
      expect(await occupancy(ids.c2)).toBe('vacant');
      expect(await prisma.occupants.count({ where: { tenancy_id: tenancy.id, end_date: null } })).toBe(0);
    });

    it('records cleared dues, and a cancelled move-out puts the tenancy back to active', async () => {
      await prisma.invoices.updateMany({ where: { unit_id: ids.c2 }, data: { paid: '1500.25', status: 'paid' } });
      const next = await rent(ids.c2, 'জামাল উদ্দিন', randomPhone(), 'active');
      const out = detail((await start(next.id, 'move_out')).body);
      await send('post', `/moves/${out.id}/cancel`).expect(200);
      expect(await tenancyStatus(next.id)).toBe('active');
      const out2 = detail((await start(next.id, 'move_out', users.officeC)).body);
      const done = detail((await send('post', `/moves/${out2.id}/complete`, users.officeC).send({ date: today() }).expect(200)).body);
      expect(done.duesCleared).toBe(true);
    });
  });

  describe('list and access', () => {
    it('lists open moves first, in the caller area, with filters', async () => {
      const pending = await rent(ids.d1, 'ডেভিড রোজারিও', '01711112222');
      const inD = detail((await start(pending.id, 'move_in')).body);

      const all = moveListSchema.parse((await get('/moves').expect(200)).body);
      expect(all.items[0]!.status).toBe('open');
      expect(all.open).toEqual({ moveIn: 1, moveOut: 0 });
      const byPhone = moveListSchema.parse((await get(`/moves?q=${encodeURIComponent('০১৭১১১১২২২২')}`).expect(200)).body);
      expect(byPhone.items.map((row) => row.id)).toEqual([inD.id]);
      const outs = moveListSchema.parse((await get('/moves?kind=move_out&status=done').expect(200)).body);
      expect(outs.total).toBe(2);

      // Block C's office sees none of Block D's moves; Block D's viewer sees only it, read-only.
      const c = moveListSchema.parse((await get('/moves', users.officeC).expect(200)).body);
      expect(c.items.some((row) => row.id === inD.id)).toBe(false);
      expect(c.open).toEqual({ moveIn: 0, moveOut: 0 });
      await get(`/moves/${inD.id}`, users.officeC).expect(404);
      await send('post', `/moves/${inD.id}/cancel`, users.officeC).expect(404);
      await get(`/moves?areaId=${ids.blockD}`, users.officeC).expect(404);
      const d = moveListSchema.parse((await get('/moves', users.viewerD).expect(200)).body);
      expect(d.items.map((row) => row.id)).toEqual([inD.id]);
      expect(detail((await get(`/moves/${inD.id}`, users.viewerD).expect(200)).body).can.edit).toBe(false);
      await send('post', `/moves/${inD.id}/cancel`, users.viewerD).expect(403);
      await start(pending.id, 'move_in', users.officeC, 404);
      await get('/moves', users.nobody).expect(403);
    });

    it('keeps other societies out', async () => {
      const level = await prisma.location_levels.create({ data: { society_id: otherSocietyId, depth: 1, name_bn: 'ইউনিট', is_unit_level: true } });
      const id = randomUUID();
      await prisma.locations.create({ data: { id, society_id: otherSocietyId, level_id: level.id, name: 'অন্য', path: `/${id}/` } });
      await prisma.units.create({ data: { location_id: id, society_id: otherSocietyId, unit_type: 'residential' } });
      const other = await prisma.tenancies.create({
        data: { society_id: otherSocietyId, unit_id: id, renter_type: 'family', status: 'pending', start_date: day('2026-01-01') },
      });
      const move = await prisma.move_events.create({ data: { society_id: otherSocietyId, tenancy_id: other.id, kind: 'move_in' } });
      await get(`/moves/${move.id}`).expect(404);
      await send('post', '/moves').send({ tenancyId: other.id, kind: 'move_in' }).expect(404);
      expect(moveListSchema.parse((await get('/moves').expect(200)).body).items.some((row) => row.id === move.id)).toBe(false);
    });
  });

  describe('resident directory', () => {
    it('lists current residents in natural address order, owners household first, without NIDs', async () => {
      const list = directoryListSchema.parse((await get('/directory').expect(200)).body);
      // Living now: D-1's pending renter, C-3's owner, C-10's renter (Bangla order: ড before স; ৩ before ১০).
      // C-2's renters have all left.
      expect(list.items.map((row) => row.place.name)).toEqual(['ডি-১', 'সি-৩', 'সি-১০']);
      expect(list.counts).toEqual({ units: 3, residents: 3 });
      const owner = list.items[1]!;
      expect(owner).toMatchObject({ household: 'owner', isOwner: true, memberNo: 7, relation: 'head', person: { name: 'মালিক সাহেব' } });
      expect(owner.place.address).toEqual(['ব্লক সি', 'রোড সি-১']);
      expect(list.items[2]).toMatchObject({ household: 'renter', isOwner: false, memberNo: null });
      expect(JSON.stringify(list)).not.toContain('1234567890');
    });

    it('searches names, units and phones in either digit form, and pages', async () => {
      const bangla = ownerPhone.replace(/\d/g, (digit) => '০১২৩৪৫৬৭৮৯'[Number(digit)]!);
      const byPhone = directoryListSchema.parse((await get(`/directory?q=${encodeURIComponent(bangla.slice(3))}`).expect(200)).body);
      expect(byPhone.items.map((row) => row.person.id)).toEqual([ids.owner]);
      const byUnit = directoryListSchema.parse((await get(`/directory?q=${encodeURIComponent('ডি-১')}`).expect(200)).body);
      expect(byUnit.total).toBe(1);
      const paged = directoryListSchema.parse((await get('/directory?pageSize=2&page=2').expect(200)).body);
      expect([paged.total, paged.items.length]).toEqual([3, 1]);
    });

    it('keeps each caller to their area', async () => {
      const c = directoryListSchema.parse((await get('/directory', users.officeC).expect(200)).body);
      expect(c.items.map((row) => row.place.name)).toEqual(['সি-৩', 'সি-১০']);
      expect(c.counts).toEqual({ units: 2, residents: 2 });
      await get(`/directory?areaId=${ids.blockD}`, users.officeC).expect(404);
      const d = directoryListSchema.parse((await get(`/directory?areaId=${ids.blockD}`, users.viewerD).expect(200)).body);
      expect(d.items.map((row) => row.place.name)).toEqual(['ডি-১']);
      await get('/directory', users.approverC).expect(403);
      await get('/directory', users.nobody).expect(403);
    });

    it('prints and exports everyone under a place; CSV needs members.export', async () => {
      const sheet = directoryPrintSchema.parse((await get(`/directory/print?areaId=${ids.roadC1}`, users.officeC).expect(200)).body);
      expect(sheet).toMatchObject({ area: { id: ids.roadC1, name: 'রোড সি-১' }, truncated: false });
      expect(sheet.items).toHaveLength(2);
      await get('/directory/csv', users.officeC).expect(403);
      const csv = await get('/directory/csv?lang=en', users.exporter).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
      expect(lines[0]).toBe('Address,Unit,Name,Name (English),Relation,Household,Owner,Phone,Membership ID,Since');
      expect(lines).toHaveLength(4);
      expect(lines[2]).toContain("মালিক সাহেব,,Head of household,Owner's,Yes");
      expect(csv.text).not.toContain('1234567890');
    });
  });
});
