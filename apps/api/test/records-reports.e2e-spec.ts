import { INestApplication } from '@nestjs/common';
import { AUTH_COOKIES, CSRF_HEADER, membersReportSchema, occupancyReportSchema, rentersReportSchema } from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-records-reports-${Date.now()}`;

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type Caller = { cookie: string; id: string };

/**
 * Records reports, in a society of its own. Block C: building 9 (owned by Rahim) with C-1 where
 * he lives and C-2 rented to Karim's family; building 10 with C-3, empty. Block D: D-1, owned by
 * Jamal and let to a shop company; D-2, no longer in use. Occupancy is set on the units as the
 * API would keep it.
 */
describe('Records reports (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'unitsC' | 'membersC' | 'viewerC' | 'nobody', Caller>;
  const ids = {} as Record<'blockC' | 'blockD' | 'b9' | 'b10' | 'c1' | 'c2' | 'c3' | 'd1' | 'd2' | 'rahim' | 'karim' | 'salma' | 'jamal', string>;

  async function makeUser(permissions: string[], scope: string | null = null): Promise<Caller> {
    const rows = await prisma.permissions.findMany();
    const user = await prisma.users.create({ data: { society_id: societyId, phone: randomPhone(), status: 'active' } });
    if (permissions.length > 0) {
      const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
      await prisma.role_permissions.createMany({
        data: permissions.map((name) => ({ role_id: role.id, permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id })),
      });
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id, scope_location_id: scope } });
    }
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=csrf`, id: user.id };
  }

  const get = (url: string, caller = users.admin) => request(server()).get(url).set('Cookie', caller.cookie);
  const occupancy = async (query: string, caller = users.admin) => occupancyReportSchema.parse((await get(`/reports/occupancy?${query}`, caller).expect(200)).body);
  const members = async (query: string, caller = users.admin) => membersReportSchema.parse((await get(`/reports/members?${query}`, caller).expect(200)).body);
  const renters = async (query: string, caller = users.admin) => rentersReportSchema.parse((await get(`/reports/renters?${query}`, caller).expect(200)).body);
  const sharing = (value: boolean) =>
    prisma.society_settings.upsert({
      where: { society_id_key: { society_id: societyId, key: 'share_renters_with_thana' } },
      update: { value },
      create: { society_id: societyId, key: 'share_renters_with_thana', value },
    });

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
    const place = async (levelId: string, name: string, parent: { id: string; path: string } | null, is_active = true) => {
      const id = randomUUID();
      const path = `${parent?.path ?? '/'}${id}/`;
      await prisma.locations.create({ data: { id, society_id: societyId, level_id: levelId, parent_id: parent?.id ?? null, name, path, is_active } });
      return { id, path };
    };
    const unit = async (levelId: string, name: string, parent: { id: string; path: string }, occupancy: string, is_active = true) => {
      const row = await place(levelId, name, parent, is_active);
      await prisma.units.create({ data: { location_id: row.id, society_id: societyId, unit_type: 'residential', occupancy } });
      return row.id;
    };
    const block = await level(1, 'ব্লক');
    const building = await level(2, 'ভবন');
    const flat = await level(3, 'ইউনিট', true);
    const c = await place(block, 'ব্লক সি', null);
    const d = await place(block, 'ব্লক ডি', null);
    const b9 = await place(building, 'ভবন ৯', c);
    const b10 = await place(building, 'ভবন ১০', c);
    const bD = await place(building, 'ভবন ১', d);
    Object.assign(ids, { blockC: c.id, blockD: d.id, b9: b9.id, b10: b10.id });
    ids.c1 = await unit(flat, 'সি-১', b9, 'owner_occupied');
    ids.c2 = await unit(flat, 'সি-২', b9, 'rented');
    ids.c3 = await unit(flat, 'সি-৩', b10, 'vacant');
    ids.d1 = await unit(flat, 'ডি-১', bD, 'rented');
    ids.d2 = await unit(flat, 'ডি-২', bD, 'vacant', false);

    const person = (full_name: string, nid: string | null = null) =>
      prisma.persons.create({ data: { society_id: societyId, full_name, phone: randomPhone(), nid } }).then((r) => r.id);
    ids.rahim = await person('রহিম');
    ids.karim = await person('করিম', '1990123456789');
    ids.salma = await person('সালমা');
    ids.jamal = await person('জামাল');
    await prisma.ownerships.create({ data: { society_id: societyId, location_id: b9.id, person_id: ids.rahim, start_date: day('2020-01-01') } });
    await prisma.ownerships.create({ data: { society_id: societyId, location_id: ids.d1, person_id: ids.jamal, start_date: day('2020-01-01') } });

    const family = await prisma.tenancies.create({
      data: { society_id: societyId, unit_id: ids.c2, renter_type: 'family', primary_person_id: ids.karim, start_date: day('2025-01-01'), status: 'active' },
    });
    for (const [person_id, relation] of [
      [ids.karim, 'head'],
      [ids.salma, 'spouse'],
    ] as const) {
      await prisma.occupants.create({ data: { society_id: societyId, unit_id: ids.c2, person_id, tenancy_id: family.id, relation, start_date: day('2025-01-01') } });
    }
    const company = await prisma.organisations.create({ data: { society_id: societyId, name: 'রহমান ট্রেডার্স', contact_person_id: ids.jamal } });
    await prisma.tenancies.create({
      data: { society_id: societyId, unit_id: ids.d1, renter_type: 'shop', organisation_id: company.id, start_date: day('2024-06-01'), status: 'moving_out', police_form_submitted: true },
    });

    await prisma.memberships.createMany({
      data: [
        { society_id: societyId, person_id: ids.jamal, location_id: ids.d1, member_no: 8, status: 'lapsed', joined_on: day('2025-05-01') },
        { society_id: societyId, person_id: ids.rahim, location_id: ids.c1, member_no: 7, joined_on: day('2026-02-01') },
        { society_id: societyId, person_id: ids.karim, member_no: 9, status: 'cancelled', joined_on: day('2026-03-01') },
      ],
    });

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    users.unitsC = await makeUser(['units:view', 'units:export'], ids.blockC);
    users.membersC = await makeUser(['members:view', 'members:export'], ids.blockC);
    users.viewerC = await makeUser(['members:view', 'units:view'], ids.blockC);
    users.nobody = await makeUser([]);
  });

  afterAll(async () => {
    if (!prisma) return;
    const society = { society_id: societyId };
    await prisma.memberships.deleteMany({ where: society });
    await prisma.occupants.deleteMany({ where: society });
    await prisma.tenancies.deleteMany({ where: society });
    await prisma.organisations.deleteMany({ where: society });
    await prisma.ownerships.deleteMany({ where: society });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: society } });
    await prisma.societies.deleteMany({ where: { id: societyId } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  describe('occupancy by area', () => {
    it('counts active units by occupancy per place, and opens down to the units', async () => {
      const top = await occupancy('');
      expect(top.parent).toBeNull();
      expect(top.areas.map((a) => [a.name, a.units, a.ownerOccupied, a.rented, a.vacant, a.occupiedPercent])).toEqual([
        ['ব্লক ডি', 1, 0, 1, 0, 100],
        ['ব্লক সি', 3, 1, 1, 1, 66],
      ]);
      expect(top.totals).toEqual({ units: 4, ownerOccupied: 1, rented: 2, vacant: 1, occupiedPercent: 75 });

      const blockC = await occupancy(`parentId=${ids.blockC}`);
      expect(blockC.crumbs.map((c) => c.name)).toEqual(['ব্লক সি']);
      // Natural order: ৯ before ১০.
      expect(blockC.areas.map((a) => [a.name, a.units])).toEqual([
        ['ভবন ৯', 2],
        ['ভবন ১০', 1],
      ]);
      const b9 = await occupancy(`parentId=${ids.b9}`);
      expect(b9.areas.map((a) => [a.name, a.isUnit, a.occupancy])).toEqual([
        ['সি-১', true, 'owner_occupied'],
        ['সি-২', true, 'rented'],
      ]);
    });

    it('keeps to the caller area', async () => {
      const office = await occupancy('', users.unitsC);
      expect(office.areas.map((a) => a.name)).toEqual(['ব্লক সি']);
      expect(office.totals.units).toBe(3);
      expect((await get(`/reports/occupancy?parentId=${ids.blockD}`, users.unitsC).expect(404)).body.code).toBe('location_not_found');
      await get('/reports/occupancy', users.nobody).expect(403);
    });

    it('downloads as CSV with units.export only', async () => {
      const csv = await get(`/reports/occupancy/csv?parentId=${ids.blockC}&lang=en`, users.unitsC).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('Area,Units,Owner occupied,Rented,Vacant,Occupied %');
      expect(csv.text).toContain('Total,3,1,1,1,66');
      await get('/reports/occupancy/csv', users.viewerC).expect(403);
    });
  });

  describe('members', () => {
    it('counts memberships by status and lists who joined in the range', async () => {
      const report = await members('from=2025-01-01&to=2026-12-31');
      expect(report.counts).toEqual({ active: 1, lapsed: 1, cancelled: 1 });
      expect(report.joined.map((m) => [m.memberNo, m.name, m.joinedOn, m.status])).toEqual([
        [8, 'জামাল', '2025-05-01', 'lapsed'],
        [7, 'রহিম', '2026-02-01', 'active'],
        [9, 'করিম', '2026-03-01', 'cancelled'],
      ]);
      expect(report.joined.find((m) => m.memberNo === 7)!.address).toEqual(['ব্লক সি', 'ভবন ৯', 'সি-১']);
      expect(report.joined.find((m) => m.memberNo === 9)!.address).toEqual([]);
      expect((await members('from=2026-02-15&to=2026-12-31')).joined.map((m) => m.memberNo)).toEqual([9]);
      expect((await get('/reports/members?from=2026-05-01&to=2026-01-01').expect(400)).body.code).toBe('invalid_range');
    });

    it('shows a caller limited to an area only the memberships recorded there', async () => {
      const office = await members('from=2025-01-01&to=2026-12-31', users.viewerC);
      expect(office.counts).toEqual({ active: 1, lapsed: 0, cancelled: 0 });
      expect(office.joined.map((m) => m.memberNo)).toEqual([7]);
      await get(`/reports/members?locationId=${ids.blockD}`, users.viewerC).expect(404);
      expect((await members(`from=2025-01-01&to=2026-12-31&locationId=${ids.blockD}`)).joined.map((m) => m.memberNo)).toEqual([8]);
      await get('/reports/members', users.unitsC).expect(403);
    });

    it('downloads as CSV with members.export only', async () => {
      const csv = await get('/reports/members/csv?from=2025-01-01&to=2026-12-31', users.membersC).expect(200);
      expect(csv.text).toContain('সদস্যপদ আইডি,নাম,ফোন,ঠিকানা,যোগদান,অবস্থা');
      expect(csv.text).toContain('7,রহিম');
      expect(csv.text).not.toContain('জামাল');
      await get('/reports/members/csv', users.viewerC).expect(403);
    });
  });

  describe('renters for the police station', () => {
    it('is refused while the society does not share renter details', async () => {
      expect((await get('/reports/renters', users.membersC).expect(403)).body.code).toBe('thana_sharing_off');
      await sharing(false);
      expect((await get('/reports/renters/csv', users.membersC).expect(403)).body.code).toBe('thana_sharing_off');
    });

    it('lists current renters in the caller export area, never the NID', async () => {
      await sharing(true);
      const office = await renters('', users.membersC);
      expect(office.rows).toEqual([
        expect.objectContaining({
          unit: 'সি-২',
          address: ['ব্লক সি', 'ভবন ৯'],
          renter: expect.objectContaining({ kind: 'person', id: ids.karim, name: 'করিম' }),
          renterType: 'family',
          status: 'active',
          startDate: '2025-01-01',
          household: 2,
          policeForm: false,
        }),
      ]);
      expect(office.totals).toEqual({ tenancies: 1, people: 2, policeFormMissing: 1 });
      expect(JSON.stringify(office)).not.toContain('1990123456789');

      const all = await renters('');
      expect(all.rows.map((r) => [r.unit, r.renter.kind, r.status])).toEqual([
        ['ডি-১', 'organisation', 'moving_out'],
        ['সি-২', 'person', 'active'],
      ]);
      const jamalPhone = (await prisma.persons.findUniqueOrThrow({ where: { id: ids.jamal } })).phone;
      expect(all.rows[0]!.phone).toBe(jamalPhone);
      expect((await renters(`locationId=${ids.blockD}`)).rows.map((r) => r.unit)).toEqual(['ডি-১']);
      await get(`/reports/renters?locationId=${ids.blockD}`, users.membersC).expect(404);
      await get('/reports/renters', users.viewerC).expect(403);
    });

    it('downloads as CSV', async () => {
      const csv = await get('/reports/renters/csv?lang=en', users.membersC).expect(200);
      expect(csv.text).toContain('Unit,Address,Renter,Phone,Kind,Since,People,Police form');
      expect(csv.text).toContain('Family,2025-01-01,2,Missing');
      expect(csv.text).not.toContain('1990123456789');
    });
  });
});
