import { INestApplication } from '@nestjs/common';
import {
  addDays,
  attendanceDaySchema,
  attendanceMonthSchema,
  AUTH_COOKIES,
  CSRF_HEADER,
  documentListSchema,
  staffDetailSchema,
  staffListSchema,
  type StaffDetail,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-staff-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const randomNid = () => String(Math.floor(1e9 + Math.random() * 9e9));
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const pdf = () => Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF\n', 'latin1');
const dhakaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

type Caller = { cookie: string; id: string };
type Grant = [permissions: string[], scope: string | null];

/**
 * Staff and attendance, in a society of its own. Block C holds flat C1 (Rahim owns it), Block D
 * is the other block. Kalam guards Block C, Jamal Block D. Supervisors hold area-limited roles.
 */
describe('Staff and attendance (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'officeC' | 'supervisorC' | 'nobody', Caller>;
  const ids = {} as Record<'blockC' | 'blockD' | 'c1' | 'rahim' | 'otherStaff', string>;
  const staff = {} as Record<'kalam' | 'jamal' | 'rahim' | 'kalam2', StaffDetail>;
  const today = dhakaToday();
  const kalamPhone = randomPhone();
  const kalamNid = randomNid();

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
  const detail = async (id: string, caller = users.admin) => staffDetailSchema.parse((await get(`/staff/${id}`, caller).expect(200)).body);
  const roster = async (date: string, caller = users.admin) => attendanceDaySchema.parse((await get(`/attendance?date=${date}`, caller).expect(200)).body);
  const mark = (date: string, entries: object[], caller = users.admin) => send('put', '/attendance', caller).send({ date, entries });

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
    const blockLevel = await level(1, 'ব্লক');
    const flatLevel = await level(2, 'ইউনিট', true);
    const place = async (levelId: string, name: string, parent: { id: string; path: string } | null) => {
      const id = randomUUID();
      const path = `${parent?.path ?? '/'}${id}/`;
      await prisma.locations.create({ data: { id, society_id: societyId, level_id: levelId, parent_id: parent?.id ?? null, name, path } });
      return { id, path };
    };
    const c = await place(blockLevel, 'ব্লক সি', null);
    ids.blockC = c.id;
    ids.blockD = (await place(blockLevel, 'ব্লক ডি', null)).id;
    ids.c1 = (await place(flatLevel, 'সি-১', c)).id;
    await prisma.units.create({ data: { location_id: ids.c1, society_id: societyId, unit_type: 'residential' } });
    ids.rahim = (await prisma.persons.create({ data: { society_id: societyId, full_name: 'রহিম উদ্দিন', phone: randomPhone() } })).id;
    await prisma.ownerships.create({ data: { society_id: societyId, location_id: ids.c1, person_id: ids.rahim, start_date: day('2020-01-01') } });

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;
    const otherLevel = await prisma.location_levels.create({ data: { society_id: otherSocietyId, depth: 1, name_bn: 'ব্লক' } });
    const otherPlaceId = randomUUID();
    await prisma.locations.create({ data: { id: otherPlaceId, society_id: otherSocietyId, level_id: otherLevel.id, name: 'ব্লক এ', path: `/${otherPlaceId}/` } });
    const otherPerson = await prisma.persons.create({ data: { society_id: otherSocietyId, full_name: 'অন্য প্রহরী' } });
    ids.otherStaff = (
      await prisma.staff.create({
        data: { society_id: otherSocietyId, person_id: otherPerson.id, staff_no: 1, designation_bn: 'প্রহরী', kind: 'permanent', posted_location_id: otherPlaceId, joined_on: day('2026-01-01') },
      })
    ).id;

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser([[everything, null]]);
    users.officeC = await makeUser([
      [['staff:view', 'staff:create', 'staff:edit', 'attendance:view', 'attendance:edit'], ids.blockC],
      [['documents:view', 'documents:create', 'documents:edit'], null],
    ]);
    users.supervisorC = await makeUser([
      [['staff:view', 'attendance:view', 'attendance:edit'], ids.blockC],
      [['documents:view'], null],
    ]);
    users.nobody = await makeUser([]);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    await prisma.documents.deleteMany({ where: { society_id: societies } });
    await prisma.attendance.deleteMany({ where: { society_id: societies } });
    await prisma.staff.deleteMany({ where: { society_id: societies } });
    await prisma.ownerships.deleteMany({ where: { society_id: societies } });
    await prisma.persons.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    for (const depth of [2, 1]) await prisma.locations.deleteMany({ where: { society_id: societies, location_levels: { depth } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  describe('staff', () => {
    it('adds staff with numbers in order, reusing a person on file by phone', async () => {
      const add = (body: object, caller = users.admin) => send('post', '/staff', caller).send(body);
      staff.kalam = staffDetailSchema.parse(
        (
          await add({
            person: { fullName: ' কালাম মিয়া ', phone: kalamPhone, nid: kalamNid },
            designationBn: 'নিরাপত্তা প্রহরী',
            designationEn: 'Security guard',
            kind: 'permanent',
            postedLocationId: ids.blockC,
            joinedOn: '2026-01-01',
            pay: '১২,০০০',
          }).expect(201)
        ).body,
      );
      expect(staff.kalam).toMatchObject({ staffNo: 1, kind: 'permanent', pay: '12000.00', leftOn: null, posted: { id: ids.blockC } });
      expect(staff.kalam.personDetail).toMatchObject({ fullName: 'কালাম মিয়া', nid: kalamNid, hasNid: true });
      expect(staff.kalam.can).toMatchObject({ edit: true, editPerson: true, pay: true, leave: true, rejoin: false, attendance: true });

      staff.jamal = staffDetailSchema.parse(
        (
          await add({ person: { fullName: 'জামাল' }, designationBn: 'পরিচ্ছন্নতাকর্মী', kind: 'daily', postedLocationId: ids.blockD, joinedOn: '2026-01-01', pay: '600' }).expect(201)
        ).body,
      );
      expect(staff.jamal).toMatchObject({ staffNo: 2, kind: 'daily', pay: '600.00' });

      const rahimPhone = (await prisma.persons.findUniqueOrThrow({ where: { id: ids.rahim } })).phone!;
      staff.rahim = staffDetailSchema.parse(
        (
          await add({ person: { fullName: 'অন্য নাম', phone: rahimPhone }, designationBn: 'তত্ত্বাবধায়ক', kind: 'contract', postedLocationId: ids.blockC, joinedOn: '2026-02-01' }).expect(201)
        ).body,
      );
      expect(staff.rahim).toMatchObject({ staffNo: 3, person: { id: ids.rahim, name: 'রহিম উদ্দিন' }, pay: null });

      // Someone already working can't start a second stint.
      expect((await add({ person: { fullName: 'কালাম', phone: kalamPhone }, designationBn: 'x', kind: 'daily', postedLocationId: ids.blockC, joinedOn: '2026-03-01' }).expect(409)).body.code).toBe(
        'staff_current_exists',
      );
      expect(await prisma.audit_logs.count({ where: { entity_type: 'staff', action: 'create', society_id: societyId } })).toBe(3);
    });

    it('keeps area staff to their area, and pay and NIDs to those allowed', async () => {
      const listed = staffListSchema.parse((await get('/staff', users.supervisorC).expect(200)).body);
      expect(listed.items.map((row) => row.staffNo)).toEqual([1, 3]);
      expect(listed.current).toBe(2);
      expect(listed.can).toEqual({ create: false, export: false });
      expect(listed.designations.map((d) => d.bn).sort()).toEqual(['তত্ত্বাবধায়ক', 'নিরাপত্তা প্রহরী'].sort());
      expect(staffListSchema.parse((await get('/staff?q=১', users.admin).expect(200)).body).items.map((row) => row.staffNo)).toContain(1);
      expect(staffListSchema.parse((await get(`/staff?q=${kalamPhone.slice(-6)}`).expect(200)).body).items.map((row) => row.id)).toEqual([staff.kalam.id]);

      await get(`/staff/${staff.jamal.id}`, users.supervisorC).expect(404);
      await get(`/staff/${ids.otherStaff}`).expect(404);
      await get('/staff', users.nobody).expect(403);

      const seen = await detail(staff.kalam.id, users.supervisorC);
      expect(seen.pay).toBeNull();
      expect(seen.personDetail).toMatchObject({ nid: null, hasNid: true });
      expect(seen.can).toMatchObject({ edit: false, pay: false, attendance: true });

      // The Block C office may add and edit in Block C, but not set pay or reach Block D.
      const officeAdd = { person: { fullName: 'নতুন প্রহরী' }, designationBn: 'প্রহরী', kind: 'permanent', joinedOn: '2026-03-01' };
      await send('post', '/staff', users.officeC).send({ ...officeAdd, postedLocationId: ids.blockC, pay: '9000' }).expect(403);
      await send('post', '/staff', users.officeC).send({ ...officeAdd, postedLocationId: ids.blockD }).expect(404);
      await send('patch', `/staff/${staff.kalam.id}`, users.officeC).send({ pay: '1' }).expect(403);
      await send('patch', `/staff/${staff.kalam.id}`, users.officeC).send({ postedLocationId: ids.blockD }).expect(404);
      await send('patch', `/staff/${staff.kalam.id}`, users.supervisorC).send({ designationBn: 'x' }).expect(403);
    });

    it("edits the staff record, and the person's details only when they are on file as staff alone", async () => {
      const office = await detail(staff.kalam.id, users.officeC);
      expect(office.can).toMatchObject({ edit: true, editPerson: true, pay: false });
      expect(office.personDetail.nid).toBe(kalamNid);
      const changed = staffDetailSchema.parse(
        (
          await send('patch', `/staff/${staff.kalam.id}`, users.officeC)
            .send({ designationBn: 'প্রধান প্রহরী', person: { fullName: 'কালাম মিয়া', fullNameEn: 'Kalam Mia', phone: kalamPhone, nid: kalamNid } })
            .expect(200)
        ).body,
      );
      expect(changed).toMatchObject({ designation: { bn: 'প্রধান প্রহরী' }, person: { nameEn: 'Kalam Mia' } });

      // Rahim owns a flat: only someone who may edit him as a member changes his details here.
      expect((await detail(staff.rahim.id, users.officeC)).can.editPerson).toBe(false);
      await send('patch', `/staff/${staff.rahim.id}`, users.officeC).send({ person: { fullName: 'বদল' } }).expect(403);

      const audit = await prisma.audit_logs.findFirstOrThrow({ where: { entity_type: 'staff', entity_id: staff.kalam.id, action: 'update' } });
      expect(JSON.stringify([audit.before_data, audit.after_data])).not.toContain(kalamNid);
      expect(audit.after_data).toMatchObject({ personChanged: true, nidChanged: false });
    });
  });

  describe('attendance', () => {
    it("saves the day's roster in the caller's area and audits only changes", async () => {
      const day0 = await roster(today, users.supervisorC);
      expect(day0.items.map((item) => item.staff.staffNo)).toEqual([1, 3]);
      expect(day0.counts.unmarked).toBe(2);

      const saved = attendanceDaySchema.parse(
        (
          await mark(
            today,
            [
              { staffId: staff.kalam.id, status: 'present', inTime: '08:00', outTime: '20:00' },
              { staffId: staff.rahim.id, status: 'leave', note: 'অসুস্থ' },
            ],
            users.supervisorC,
          ).expect(200)
        ).body,
      );
      expect(saved.items[0]!.mark).toMatchObject({ status: 'present', inTime: '08:00', outTime: '20:00', markedBy: { id: users.supervisorC.id } });
      expect(saved.counts).toMatchObject({ present: 1, leave: 1, unmarked: 0 });

      await mark(today, [{ staffId: staff.kalam.id, status: 'present', inTime: '08:00', outTime: '20:00' }], users.supervisorC).expect(200);
      expect(await prisma.audit_logs.count({ where: { entity_type: 'attendance', society_id: societyId } })).toBe(1);

      expect((await mark(today, [{ staffId: staff.jamal.id, status: 'present' }], users.supervisorC).expect(404)).body.code).toBe('staff_not_found');
      await mark(today, [{ staffId: ids.otherStaff, status: 'present' }]).expect(404);
      await mark(today, [{ staffId: staff.kalam.id, status: 'absent', inTime: '08:00' }]).expect(400);
      expect(await prisma.attendance.count({ where: { society_id: societyId } })).toBe(2);
    });

    it('lets plain editors change today and yesterday only; approvers older days; nobody the future', async () => {
      await mark(addDays(today, -1), [{ staffId: staff.kalam.id, status: 'half_day' }], users.supervisorC).expect(200);
      const old = addDays(today, -3);
      expect((await mark(old, [{ staffId: staff.kalam.id, status: 'absent' }], users.supervisorC).expect(403)).body.code).toBe('attendance_locked');
      expect((await roster(old, users.supervisorC)).locked).toBe(true);
      await mark(old, [{ staffId: staff.kalam.id, status: 'absent' }]).expect(200);
      expect((await mark(addDays(today, 1), [{ staffId: staff.kalam.id, status: 'present' }]).expect(400)).body.code).toBe('future_date');
      expect((await mark('2025-12-31', [{ staffId: staff.kalam.id, status: 'present' }]).expect(409)).body.code).toBe('staff_not_current');
    });

    it("gives one staff member's month with counts and days worked", async () => {
      await mark('2026-03-02', [{ staffId: staff.kalam.id, status: 'present' }]).expect(200);
      await mark('2026-03-03', [{ staffId: staff.kalam.id, status: 'half_day' }]).expect(200);
      await mark('2026-03-04', [{ staffId: staff.kalam.id, status: 'absent' }]).expect(200);
      const month = attendanceMonthSchema.parse((await get(`/attendance/month?month=2026-03&staffId=${staff.kalam.id}`, users.supervisorC).expect(200)).body);
      expect(month.days).toHaveLength(31);
      expect(month.counts).toEqual({ present: 1, half_day: 1, leave: 0, absent: 1, off: 0, unmarked: 28 });
      expect(month.daysWorked).toBe('1.5');
      const rahimMonth = attendanceMonthSchema.parse((await get(`/attendance/month?month=2026-01&staffId=${staff.rahim.id}`).expect(200)).body);
      expect(rahimMonth.days.every((d) => d.outside)).toBe(true);
      await get(`/attendance/month?month=2026-03&staffId=${staff.jamal.id}`, users.supervisorC).expect(404);
    });

    it('exports the month to CSV only with the export grant', async () => {
      await get('/attendance/csv?month=2026-03', users.supervisorC).expect(403);
      const csv = await get('/attendance/csv?month=2026-03&lang=en').expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('Days worked');
      expect(csv.text).toMatch(/1,Kalam Mia\b.*,1,1,0,1,0,28,1\.5/);
    });
  });

  describe('leaving and rejoining', () => {
    it('dates a leave after the last marked day, then keeps the stint read-only', async () => {
      expect((await send('post', `/staff/${staff.kalam.id}/leave`).send({ leftOn: addDays(today, -1), reason: 'চাকরি ছেড়েছেন' }).expect(409)).body.code).toBe(
        'attendance_after_leave',
      );
      expect((await send('post', `/staff/${staff.kalam.id}/leave`).send({ leftOn: addDays(today, 1), reason: 'x' }).expect(400)).body.code).toBe('future_date');
      await send('post', `/staff/${staff.kalam.id}/leave`, users.supervisorC).send({ leftOn: today, reason: 'x' }).expect(403);
      const left = staffDetailSchema.parse((await send('post', `/staff/${staff.kalam.id}/leave`).send({ leftOn: today, reason: 'চাকরি ছেড়েছেন' }).expect(200)).body);
      expect(left).toMatchObject({ leftOn: today, leftReason: 'চাকরি ছেড়েছেন' });
      expect(left.can).toMatchObject({ edit: false, leave: false, rejoin: true });

      expect((await send('patch', `/staff/${staff.kalam.id}`).send({ designationBn: 'x' }).expect(409)).body.code).toBe('staff_left');
      expect(staffListSchema.parse((await get('/staff?state=left').expect(200)).body).items.map((row) => row.id)).toEqual([staff.kalam.id]);
      expect(staffListSchema.parse((await get('/staff').expect(200)).body).items.map((row) => row.id)).not.toContain(staff.kalam.id);
    });

    it('starts a new stint with a new number and the old one kept', async () => {
      expect((await send('post', `/staff/${staff.kalam.id}/rejoin`).send({ joinedOn: today }).expect(400)).body.code).toBe('rejoin_before_leave');
      await send('post', `/staff/${staff.jamal.id}/rejoin`).send({ joinedOn: addDays(today, 1) }).expect(409);
      staff.kalam2 = staffDetailSchema.parse((await send('post', `/staff/${staff.kalam.id}/rejoin`).send({ joinedOn: addDays(today, 1) }).expect(201)).body);
      expect(staff.kalam2).toMatchObject({ staffNo: 4, person: { id: staff.kalam.person.id }, designation: { bn: 'প্রধান প্রহরী' }, pay: '12000.00', leftOn: null });
      expect(staff.kalam2.stints.map((stint) => stint.id)).toEqual([staff.kalam.id]);
      expect((await detail(staff.kalam.id)).can.rejoin).toBe(false);
    });
  });

  describe('papers and CSV', () => {
    it("keeps a staff member's papers with the stint, NID copies only for those who may edit the person", async () => {
      const upload = (caller: Caller, fields: Record<string, string>) => {
        let req = send('post', '/documents', caller);
        for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
        return req.attach('file', pdf(), 'paper.pdf');
      };
      await upload(users.officeC, { entityType: 'staff', entityId: staff.kalam2.id, docType: 'contract', title: 'নিয়োগপত্র' }).expect(201);
      await upload(users.officeC, { entityType: 'staff', entityId: staff.kalam2.id, docType: 'nid', title: 'এনআইডি' }).expect(201);
      await upload(users.officeC, { entityType: 'staff', entityId: staff.jamal.id, docType: 'contract', title: 'x' }).expect(404);
      await upload(users.supervisorC, { entityType: 'staff', entityId: staff.kalam2.id, docType: 'contract', title: 'x' }).expect(403);

      const query = `/documents?entityType=staff&entityId=${staff.kalam2.id}`;
      expect(documentListSchema.parse((await get(query, users.officeC).expect(200)).body).total).toBe(2);
      const seen = documentListSchema.parse((await get(query, users.supervisorC).expect(200)).body);
      expect(seen.items.map((doc) => doc.docType)).toEqual(['contract']);
    });

    it('exports the staff list without NIDs, with pay only for society-wide editors', async () => {
      const csv = await get('/staff/csv?state=all&lang=en').expect(200);
      expect(csv.text).toContain('Salary / daily rate');
      expect(csv.text).toContain('12000.00');
      expect(csv.text).not.toContain(kalamNid);
      await get('/staff/csv', users.supervisorC).expect(403);
    });
  });
});
