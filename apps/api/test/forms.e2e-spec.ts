import { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  bnDigits,
  CSRF_HEADER,
  FORM_HONEYPOT,
  formDetailSchema,
  formEntrySchema,
  formListSchema,
  formReceiptSchema,
  locationViewSchema,
  personDetailSchema,
  publicPlaceListSchema,
  unitDetailSchema,
} from '@s57/shared';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { ENV, type Env } from './../src/config/env.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-forms-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const randomNid = () => String(Math.floor(1e9 + Math.random() * 9e9));
const pdf = () => Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF\n', 'latin1');
let ipCounter = 0;
/** A fresh client address per submission, so the per-address limit only bites where a test wants it. */
const nextIp = () => `10.57.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

describe('Public forms and the office review (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let env: Env;
  let societyId: string;
  let otherSocietyId: string;
  let otherLocationId: string;
  let levels: { id: string; depth: number }[];
  const server = () => app.getHttpServer();
  // sector > block C > road 9 > plot 14 > flats 2A, 2B, 2C; block D > shop D1; block E (inactive).
  const tree = {} as Record<'sector' | 'blockC' | 'blockD' | 'blockE' | 'road9' | 'plot14', { id: string; path: string }>;
  const units = {} as Record<'flat2A' | 'flat2B' | 'flat2C' | 'shopD1', string>;
  let admin: { id: string; cookie: string };

  async function permissionIds(names: string[]) {
    const rows = await prisma.permissions.findMany();
    return names.map((name) => rows.find((p) => `${p.module}:${p.action}` === name)!.id);
  }

  async function makeRole(permissions: string[]) {
    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
    await prisma.role_permissions.createMany({
      data: (await permissionIds(permissions)).map((permission_id) => ({ role_id: role.id, permission_id })),
    });
    return role.id;
  }

  async function makeUser(roles: { roleId: string; scope?: string }[]) {
    const phone = randomPhone();
    const person = await prisma.persons.create({ data: { society_id: societyId, full_name: `ব্যবহারকারী ${MARK}`, phone } });
    const user = await prisma.users.create({ data: { society_id: societyId, person_id: person.id, phone, status: 'active' } });
    for (const role of roles) {
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.roleId, scope_location_id: role.scope ?? null } });
    }
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { id: user.id, cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}` };
  }

  const send = (method: 'post' | 'put' | 'patch' | 'delete', url: string, cookie: string) =>
    request(server())[method](url).set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, cookie: string) => request(server()).get(url).set('Cookie', cookie);
  const level = (depth: number) => levels.find((l) => l.depth === depth)!.id;

  async function addLocation(parent: keyof typeof tree | null, depth: number, name: string) {
    const res = await send('post', '/locations', admin.cookie)
      .send({ parentId: parent ? tree[parent].id : null, levelId: level(depth), name, code: null })
      .expect(201);
    const id = locationViewSchema.parse(res.body).location!.id;
    const row = await prisma.locations.findUniqueOrThrow({ where: { id } });
    return { id: row.id, path: row.path };
  }

  async function addUnit(parent: keyof typeof tree, name: string) {
    const res = await send('post', '/units', admin.cookie)
      .send({ parentId: tree[parent].id, name, code: null, unitType: 'residential', sizeSqft: null, billTo: 'owner' })
      .expect(201);
    return unitDetailSchema.parse(res.body).id;
  }

  /** A public form post: no login, no CSRF cookie, a browser Origin and a client address. */
  function submit(formKey: string, data: unknown, file?: { buffer: Buffer; name: string }, extra: Record<string, string> = {}, ip = nextIp()) {
    let req = request(server())
      .post(`/public/forms/${formKey}`)
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', ip)
      .field('data', typeof data === 'string' ? data : JSON.stringify(data));
    for (const [name, value] of Object.entries(extra)) req = req.field(name, value);
    if (file) req = req.attach('file', file.buffer, file.name);
    return req;
  }

  const membership = (locationId: string, applicant: Record<string, unknown> = {}) => ({
    applicant: { fullName: `আবেদনকারী ${MARK}`, phone: randomPhone(), nid: randomNid(), ...applicant },
    locationId,
    livesHere: true,
  });
  const renter = (unitId: string, extra: Record<string, unknown> = {}) => ({
    renter: { fullName: `ভাড়াটিয়া ${MARK}`, phone: randomPhone(), nid: null },
    renterType: 'family',
    unitId,
    moveInDate: '2026-11-01',
    owner: { name: `মালিক ${MARK}`, phone: null },
    household: [
      { fullName: `স্ত্রী ${MARK}`, relation: 'spouse' },
      { fullName: `ছেলে ${MARK}`, relation: 'child' },
    ],
    ...extra,
  });
  const deed = () => ({ buffer: pdf(), name: 'deed.pdf' });
  const receipt = (res: request.Response) => formReceiptSchema.parse(res.body);
  const submissionOf = (reference: string) => prisma.form_submissions.findFirstOrThrow({ where: { society_id: societyId, reference } });
  const detail = async (id: string, cookie = admin.cookie) => formDetailSchema.parse((await get(`/forms/${id}`, cookie).expect(200)).body);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    env = app.get<Env>(ENV);
    societyId = (await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } })).id;
    const other = await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: MARK } });
    otherSocietyId = other.id;
    const otherLevel = await prisma.location_levels.create({ data: { society_id: otherSocietyId, depth: 1, name_bn: 'সেক্টর', is_unit_level: false } });
    const otherId = randomUUID();
    otherLocationId = (
      await prisma.locations.create({ data: { id: otherId, society_id: otherSocietyId, level_id: otherLevel.id, name: `অন্য ${MARK}`, path: `/${otherId}/` } })
    ).id;
    const systemRoleId = (await prisma.roles.findFirstOrThrow({ where: { society_id: societyId, is_system: true } })).id;
    levels = await prisma.location_levels.findMany({ where: { society_id: societyId }, select: { id: true, depth: true } });
    admin = await makeUser([{ roleId: systemRoleId }]);

    tree.sector = await addLocation(null, 1, `${MARK} সেক্টর`);
    tree.blockC = await addLocation('sector', 2, 'ব্লক সি');
    tree.blockD = await addLocation('sector', 2, 'ব্লক ডি');
    tree.blockE = await addLocation('sector', 2, 'ব্লক ই');
    tree.road9 = await addLocation('blockC', 3, 'রোড ৯');
    tree.plot14 = await addLocation('road9', 4, 'প্লট ১৪');
    units.flat2A = await addUnit('plot14', 'ফ্ল্যাট ২এ');
    units.flat2B = await addUnit('plot14', 'ফ্ল্যাট ২বি');
    units.flat2C = await addUnit('plot14', 'ফ্ল্যাট ২সি');
    units.shopD1 = await addUnit('blockD', 'দোকান ১');
    await prisma.locations.update({ where: { id: tree.blockE.id }, data: { is_active: false } });
  });

  afterAll(async () => {
    if (prisma) {
      const paths = tree.sector ? { path: { startsWith: tree.sector.path } } : { id: { in: [] } };
      const locationIds = (await prisma.locations.findMany({ where: paths, select: { id: true } })).map((row) => row.id);
      const submissions = await prisma.form_submissions.findMany({
        where: { OR: [{ location_id: { in: locationIds } }, { society_id: otherSocietyId }] },
        select: { id: true },
      });
      const submissionIds = submissions.map((row) => row.id);
      await prisma.documents.deleteMany({ where: { entity_type: 'form_submission', entity_id: { in: submissionIds } } });
      await prisma.memberships.deleteMany({ where: { OR: [{ location_id: { in: locationIds } }, { submission_id: { in: submissionIds } }] } });
      await prisma.audit_logs.deleteMany({ where: { entity_type: 'form_submission', entity_id: { in: submissionIds } } });
      await prisma.form_submissions.deleteMany({ where: { id: { in: submissionIds } } });
      await prisma.occupants.deleteMany({ where: { unit_id: { in: locationIds } } });
      await prisma.tenancies.deleteMany({ where: { unit_id: { in: locationIds } } });
      await prisma.ownerships.deleteMany({ where: { location_id: { in: locationIds } } });
      const persons = await prisma.persons.findMany({
        where: { OR: [{ full_name: { contains: MARK } }, { society_id: otherSocietyId }] },
        select: { id: true },
      });
      const users = await prisma.users.findMany({ where: { person_id: { in: persons.map((p) => p.id) } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      await prisma.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
      await prisma.users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organisations.deleteMany({ where: { name: { contains: MARK } } });
      await prisma.persons.deleteMany({ where: { id: { in: persons.map((p) => p.id) } } });
      const rows = await prisma.locations.findMany({ where: { OR: [paths, { society_id: otherSocietyId }] }, select: { id: true, path: true } });
      rows.sort((a, b) => b.path.length - a.path.length);
      for (const row of rows) await prisma.locations.delete({ where: { id: row.id } });
      await prisma.audit_logs.deleteMany({ where: { society_id: otherSocietyId } });
      await prisma.location_levels.deleteMany({ where: { society_id: otherSocietyId } });
      await prisma.societies.deleteMany({ where: { id: otherSocietyId } });
    }
    await app?.close();
  });

  describe('address dropdowns', () => {
    it('lists the top of the tree and each level below it, names only, active only', async () => {
      const top = publicPlaceListSchema.parse((await request(server()).get('/public/locations').expect(200)).body);
      expect(top.items.map((item) => item.id)).toContain(tree.sector.id);

      const blocks = publicPlaceListSchema.parse((await request(server()).get(`/public/locations?parentId=${tree.sector.id}`).expect(200)).body);
      // Natural Bangla order (ড before স); the inactive block E is left out.
      expect(blocks.items.map((item) => item.name)).toEqual(['ব্লক ডি', 'ব্লক সি']);
      expect(blocks.items.find((item) => item.id === tree.blockC.id)).toEqual({
        id: tree.blockC.id,
        name: 'ব্লক সি',
        levelBn: expect.any(String),
        levelEn: expect.toBeOneOf([expect.any(String), null]),
        isUnit: false,
        hasChildren: true,
      });

      const flats = publicPlaceListSchema.parse((await request(server()).get(`/public/locations?parentId=${tree.plot14.id}`).expect(200)).body);
      expect(flats.items.every((item) => item.isUnit && !item.hasChildren)).toBe(true);
    });

    it("shows nothing under an inactive place or another society's", async () => {
      for (const id of [tree.blockE.id, otherLocationId]) {
        const res = publicPlaceListSchema.parse((await request(server()).get(`/public/locations?parentId=${id}`).expect(200)).body);
        expect(res.items).toEqual([]);
      }
      await request(server()).get('/public/locations?parentId=not-a-uuid').expect(400);
    });
  });

  describe('submitting', () => {
    it('saves a membership application with its deed in private storage, NFC-normalised', async () => {
      const phone = randomPhone();
      // Typed on a Bangla keyboard with a dash; the name in decomposed form.
      const data = membership(tree.plot14.id, { fullName: `José ${MARK}`, phone: bnDigits(`${phone.slice(0, 5)}-${phone.slice(5)}`) });
      const res = await submit('membership', data, deed()).expect(201);
      const { reference } = receipt(res);
      expect(reference).toMatch(/^M-[A-HJ-NP-Z2-9]{8}$/);

      const row = await submissionOf(reference);
      expect(row).toMatchObject({ form_key: 'membership', status: 'new', location_id: tree.plot14.id, phone });
      expect((row.data as { applicant: { fullName: string } }).applicant.fullName).toBe(`José ${MARK}`);

      const doc = await prisma.documents.findFirstOrThrow({ where: { entity_type: 'form_submission', entity_id: row.id } });
      expect(doc).toMatchObject({ doc_type: 'deed', visibility: 'office', file_name: 'deed.pdf' });
      expect(doc.file_url).toMatch(new RegExp(`^${societyId}/forms/[0-9a-f-]{36}\\.pdf$`));
      expect(existsSync(join(env.PRIVATE_MEDIA_DIR, doc.file_url))).toBe(true);
      expect(existsSync(join(env.MEDIA_DIR, doc.file_url))).toBe(false);

      // The audit row says what came in, not who sent it.
      const audit = await prisma.audit_logs.findFirstOrThrow({ where: { entity_type: 'form_submission', entity_id: row.id, action: 'submit' } });
      expect(JSON.stringify(audit.after_data)).not.toContain(data.applicant.nid);
      expect(JSON.stringify(audit.after_data)).not.toContain('José');
    });

    it('accepts a photo as the document and stores it re-encoded', async () => {
      const photo = await sharp({ create: { width: 60, height: 40, channels: 3, background: '#888' } })
        .jpeg()
        .toBuffer();
      const { reference } = receipt(await submit('membership', membership(units.flat2B), { buffer: photo, name: 'deed.jpg' }).expect(201));
      const row = await submissionOf(reference);
      const doc = await prisma.documents.findFirstOrThrow({ where: { entity_type: 'form_submission', entity_id: row.id } });
      expect(doc.file_url).toMatch(/\.webp$/);
    });

    it('needs the deed for membership and checks every answer', async () => {
      await submit('membership', membership(tree.plot14.id)).expect(400).expect((res) => expect(res.body.code).toBe('file_required'));
      const noNid = await submit('membership', membership(tree.plot14.id, { nid: '' }), deed()).expect(400);
      expect(noNid.body).toMatchObject({ code: 'validation_failed', issues: [expect.objectContaining({ path: 'applicant.nid' })] });
      const badPhone = await submit('membership', membership(tree.plot14.id, { phone: '12345' }), deed()).expect(400);
      expect(badPhone.body.issues).toContainEqual({ path: 'applicant.phone', message: 'invalid_phone' });
      await submit('membership', 'not json', deed()).expect(400).expect((res) => expect(res.body.code).toBe('validation_failed'));
      await submit('unknown_form', membership(tree.plot14.id), deed()).expect(400);
    });

    it('takes a renter registration without a file; the place must be an active flat of this society', async () => {
      const ok = receipt(await submit('renter_registration', renter(units.flat2A)).expect(201));
      expect(ok.reference).toMatch(/^R-/);
      for (const unitId of [tree.plot14.id, tree.blockE.id, otherLocationId, randomUUID()]) {
        await submit('renter_registration', renter(unitId))
          .expect(400)
          .expect((res) => expect(res.body.code).toBe('invalid_place'));
      }
      // A member owns something below the whole society.
      await submit('membership', membership(tree.sector.id), deed()).expect(400).expect((res) => expect(res.body.code).toBe('invalid_place'));
    });

    it('refuses anything but a photo or a clean PDF, and saves nothing', async () => {
      const before = await prisma.form_submissions.count({ where: { society_id: societyId } });
      const html = { buffer: Buffer.from('<html><script>alert(1)</script></html>'), name: 'deed.pdf' };
      await submit('membership', membership(tree.plot14.id), html).expect(415).expect((res) => expect(res.body.code).toBe('unsupported_document'));
      const active = { buffer: Buffer.from('%PDF-1.4\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\n%%EOF\n', 'latin1'), name: 'x.pdf' };
      await submit('membership', membership(tree.plot14.id), active).expect(415);
      expect(await prisma.form_submissions.count({ where: { society_id: societyId } })).toBe(before);
    });

    it('answers a bot that fills the honeypot with a receipt, but saves nothing', async () => {
      const before = await prisma.form_submissions.count({ where: { society_id: societyId } });
      const res = await submit('membership', membership(tree.plot14.id), deed(), { [FORM_HONEYPOT]: 'http://spam.example' }).expect(201);
      expect(receipt(res).reference).toMatch(/^M-/);
      expect(await prisma.form_submissions.count({ where: { society_id: societyId } })).toBe(before);
    });

    it('refuses the same open application twice, and more than three a day from one phone', async () => {
      const phone = randomPhone();
      const first = renter(units.flat2B, { renter: { fullName: `ভাড়াটিয়া ${MARK}`, phone, nid: null } });
      await submit('renter_registration', first).expect(201);
      await submit('renter_registration', first).expect(409).expect((res) => expect(res.body.code).toBe('already_submitted'));
      await submit('renter_registration', { ...first, unitId: units.flat2C }).expect(201);
      await submit('membership', membership(units.flat2C, { phone }), deed()).expect(201);
      await submit('renter_registration', { ...first, unitId: units.shopD1 })
        .expect(429)
        .expect((res) => expect(res.body.code).toBe('too_many_submissions'));
    });

    it('limits one address to five posts in ten minutes', async () => {
      const ip = '10.99.0.1';
      for (let i = 0; i < 5; i++) await submit('renter_registration', renter(units.flat2C), undefined, {}, ip).expect(201);
      await submit('renter_registration', renter(units.flat2C), undefined, {}, ip).expect(429);
    });

    it('refuses a post from another site', async () => {
      await request(server())
        .post('/public/forms/renter_registration')
        .set('Origin', 'https://evil.example')
        .field('data', JSON.stringify(renter(units.flat2A)))
        .expect(403);
    });
  });

  describe('office review', () => {
    let blockCViewer: { id: string; cookie: string };
    let blockCOffice: { id: string; cookie: string };
    let noForms: { id: string; cookie: string };
    let cMembership: { id: string; reference: string; phone: string; nid: string };
    let dRenter: { id: string; reference: string };

    beforeAll(async () => {
      blockCViewer = await makeUser([{ roleId: await makeRole(['forms:view']), scope: tree.blockC.id }]);
      blockCOffice = await makeUser([
        {
          roleId: await makeRole(['forms:view', 'forms:edit', 'forms:approve', 'members:view', 'members:create', 'tenancies:create', 'ownerships:create']),
          scope: tree.blockC.id,
        },
      ]);
      noForms = await makeUser([{ roleId: await makeRole(['members:view']) }]);

      const data = membership(units.flat2A);
      const m = receipt(await submit('membership', data, deed()).expect(201));
      cMembership = { id: (await submissionOf(m.reference)).id, reference: m.reference, phone: data.applicant.phone, nid: data.applicant.nid };
      const r = receipt(await submit('renter_registration', renter(units.shopD1)).expect(201));
      dRenter = { id: (await submissionOf(r.reference)).id, reference: r.reference };
    });

    it('lists the queue with counts; a Block C role sees only Block C', async () => {
      const all = formListSchema.parse((await get(`/forms?areaId=${tree.sector.id}&pageSize=100`, admin.cookie).expect(200)).body);
      const ids = all.items.map((row) => row.id);
      expect(ids).toEqual(expect.arrayContaining([cMembership.id, dRenter.id]));
      const row = all.items.find((item) => item.id === cMembership.id)!;
      expect(row).toMatchObject({ reference: cMembership.reference, formKey: 'membership', status: 'new', files: 1, phone: cMembership.phone });
      expect(row.place).toMatchObject({ id: units.flat2A, isUnit: true });
      expect(row.place!.address).toEqual(expect.arrayContaining(['ব্লক সি', 'রোড ৯', 'প্লট ১৪']));

      const scoped = formListSchema.parse((await get('/forms?pageSize=100', blockCViewer.cookie).expect(200)).body);
      expect(scoped.items.map((item) => item.id)).toContain(cMembership.id);
      expect(scoped.items.map((item) => item.id)).not.toContain(dRenter.id);
      expect(scoped.items.every((item) => item.place?.address.includes('ব্লক সি'))).toBe(true);
      expect(scoped.counts.new).toBeGreaterThanOrEqual(1);
      expect(scoped.counts.new).toBeLessThan(all.counts.new);
      await get(`/forms?areaId=${tree.blockD.id}`, blockCViewer.cookie).expect(404);
    });

    it('finds by reference, by phone in Bangla digits, and filters by form and status', async () => {
      const byRef = formListSchema.parse((await get(`/forms?q=${cMembership.reference.toLowerCase()}`, admin.cookie).expect(200)).body);
      expect(byRef.items.map((row) => row.id)).toEqual([cMembership.id]);
      const byPhone = formListSchema.parse((await get(`/forms?q=${encodeURIComponent(bnDigits(cMembership.phone))}`, admin.cookie).expect(200)).body);
      expect(byPhone.items.map((row) => row.id)).toContain(cMembership.id);
      const renters = formListSchema.parse((await get(`/forms?formKey=renter_registration&areaId=${tree.sector.id}&pageSize=100`, admin.cookie).expect(200)).body);
      expect(renters.items.every((row) => row.formKey === 'renter_registration')).toBe(true);
    });

    it("keeps other areas' and other societies' applications out of reach", async () => {
      await get(`/forms/${dRenter.id}`, blockCViewer.cookie).expect(404);
      const otherRow = await prisma.form_submissions.create({
        data: { society_id: otherSocietyId, form_key: 'membership', data: {}, reference: `X-${Date.now()}`, location_id: otherLocationId },
      });
      await get(`/forms/${otherRow.id}`, admin.cookie).expect(404);
      await send('post', `/forms/${otherRow.id}/reject`, admin.cookie).send({ note: 'না' }).expect(404);
      await get('/forms', noForms.cookie).expect(403);
    });

    it('hides the NID from a role that may only view, and shows it to the office', async () => {
      const viewed = await detail(cMembership.id, blockCViewer.cookie);
      expect(viewed.membership!.applicant.nid).toBeNull();
      expect(viewed.nidHidden).toBe(true);
      expect(viewed.can).toEqual({ review: false, approve: false, reject: false, addOwnership: false });
      expect(JSON.stringify(viewed)).not.toContain(cMembership.nid);

      const office = await detail(cMembership.id, blockCOffice.cookie);
      expect(office.membership!.applicant.nid).toBe(cMembership.nid);
      expect(office.can).toEqual({ review: true, approve: true, reject: true, addOwnership: true });
      expect(office.files).toEqual([expect.objectContaining({ docType: 'deed', isImage: false })]);
    });

    it('sends an attached file only to callers who may see the application, as a download', async () => {
      const { files } = await detail(cMembership.id);
      const url = `/forms/${cMembership.id}/files/${files[0]!.id}`;
      const res = await get(url, blockCViewer.cookie).buffer(true).expect(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/^attachment/);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(Buffer.from(res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

      const outsider = await makeUser([{ roleId: await makeRole(['forms:view']), scope: tree.blockD.id }]);
      await get(url, outsider.cookie).expect(404);
      await get(`/forms/${dRenter.id}/files/${files[0]!.id}`, admin.cookie).expect(404);
      await request(server()).get(url).expect(401);
    });

    it('marks an application as in review once', async () => {
      const res = formDetailSchema.parse((await send('post', `/forms/${cMembership.id}/review`, blockCOffice.cookie).send({ note: 'দলিল দেখছি' }).expect(200)).body);
      expect(res).toMatchObject({ status: 'in_review', reviewNote: 'দলিল দেখছি' });
      await send('post', `/forms/${cMembership.id}/review`, blockCOffice.cookie).send({}).expect(409);
      await send('post', `/forms/${cMembership.id}/review`, blockCViewer.cookie).send({}).expect(403);
    });

    it('approves a membership: the person, a membership waiting for its ID and the owner record', async () => {
      const res = formDetailSchema.parse(
        (await send('post', `/forms/${cMembership.id}/approve`, blockCOffice.cookie).send({ addOwnership: true, sharePercent: '১০০' }).expect(200)).body,
      );
      expect(res.status).toBe('approved');
      // A member at once, but the membership ID waits until the person is verified.
      expect(res).toMatchObject({ memberNo: null, membershipCode: null });
      expect(res.reviewerName).toContain('ব্যবহারকারী');
      expect(res.person).toMatchObject({ kind: 'person', phone: cMembership.phone });

      const person = personDetailSchema.parse((await get(`/persons/${res.person!.id}`, admin.cookie).expect(200)).body);
      expect(person.membership).toMatchObject({ memberNo: res.memberNo, status: 'active' });
      expect(person.ownerships).toEqual([expect.objectContaining({ place: expect.objectContaining({ id: units.flat2A }), sharePercent: '100' })]);
      // An owner on record is not a resident: the flat stays vacant until someone lives there.
      expect(unitDetailSchema.parse((await get(`/units/${units.flat2A}`, admin.cookie).expect(200)).body).occupancy).toBe('vacant');

      await send('post', `/forms/${cMembership.id}/approve`, blockCOffice.cookie).send({}).expect(409).expect((r) => expect(r.body.code).toBe('form_closed'));
      await send('post', `/forms/${cMembership.id}/reject`, blockCOffice.cookie).send({ note: 'না' }).expect(409);
    });

    it('makes approved applicants members without an ID until verified, and refuses a second membership, keeping the application open', async () => {
      const first = await prisma.memberships.findFirstOrThrow({ where: { submission_id: cMembership.id } });
      // The same phone applies again for another flat: they are already a member.
      const again = receipt(await submit('membership', membership(units.flat2B, { phone: cMembership.phone, nid: cMembership.nid }), deed()).expect(201));
      const againId = (await submissionOf(again.reference)).id;
      expect((await detail(againId)).matches).toEqual([expect.objectContaining({ by: ['phone', 'nid'], open: true })]);
      await send('post', `/forms/${againId}/approve`, admin.cookie).send({}).expect(409).expect((r) => expect(r.body.code).toBe('already_member'));
      expect((await detail(againId)).status).toBe('new');

      const next = receipt(await submit('membership', membership(units.flat2C), deed()).expect(201));
      const nextId = (await submissionOf(next.reference)).id;
      const approved = formDetailSchema.parse((await send('post', `/forms/${nextId}/approve`, admin.cookie).send({}).expect(200)).body);
      // Applicants aren't verified yet: the ID waits for "Mark as verified".
      expect(first.member_no).toBeNull();
      expect(approved).toMatchObject({ memberNo: null, membershipCode: null });
    });

    it("approves an organisation's application: the organisation is the member and owner, the applicant its contact", async () => {
      const phone = randomPhone();
      const organisation = { name: `সোনালী ট্রেডার্স ${MARK}`, tradeLicence: `TL-F-${MARK}` };
      const data = { applicantKind: 'organisation', applicant: { fullName: `যোগাযোগ ${MARK}`, phone, nid: null }, organisation, locationId: units.shopD1, livesHere: false };
      // An organisation's details are needed; the contact's NID is not.
      await submit('membership', { ...data, organisation: null }, deed()).expect(400);
      await submit('membership', data, deed()).expect(201);
      const submission = await prisma.form_submissions.findFirstOrThrow({ where: { phone, form_key: 'membership' } });

      const res = formDetailSchema.parse(
        (await send('post', `/forms/${submission.id}/approve`, admin.cookie).send({ addOwnership: true, sharePercent: '100' }).expect(200)).body,
      );
      expect(res.person).toMatchObject({ kind: 'organisation', name: organisation.name });
      const row = await prisma.organisations.findFirstOrThrow({ where: { name: organisation.name }, include: { persons: true } });
      expect(row.persons?.phone).toBe(phone);
      expect(await prisma.memberships.count({ where: { organisation_id: row.id, status: 'active', member_no: res.memberNo! } })).toBe(1);
      expect(await prisma.ownerships.count({ where: { organisation_id: row.id, location_id: units.shopD1, end_date: null } })).toBe(1);
    });

    it('approves a renter registration as a pending tenancy with the household', async () => {
      const r = receipt(await submit('renter_registration', renter(units.flat2B, { renterType: 'bachelor' })).expect(201));
      const id = (await submissionOf(r.reference)).id;
      const occupancyBefore = unitDetailSchema.parse((await get(`/units/${units.flat2B}`, admin.cookie).expect(200)).body).occupancy;
      const res = formDetailSchema.parse((await send('post', `/forms/${id}/approve`, blockCOffice.cookie).send({ monthlyRent: '১৫,০০০' }).expect(200)).body);
      expect(res.status).toBe('approved');

      const tenancy = await prisma.tenancies.findFirstOrThrow({ where: { unit_id: units.flat2B, status: 'pending' } });
      expect(tenancy).toMatchObject({ renter_type: 'bachelor', primary_person_id: res.person!.id });
      expect(tenancy.monthly_rent?.toString()).toBe('15000');
      expect(tenancy.start_date.toISOString().slice(0, 10)).toBe('2026-11-01');
      const household = await prisma.occupants.findMany({ where: { tenancy_id: tenancy.id }, orderBy: { relation: 'asc' } });
      expect(household.map((row) => row.relation).sort()).toEqual(['child', 'head', 'spouse']);
      // Pending: nobody has moved in yet.
      expect(unitDetailSchema.parse((await get(`/units/${units.flat2B}`, admin.cookie).expect(200)).body).occupancy).toBe(occupancyBefore);

      // The flat now has an open tenancy, so another registration for it can't be approved.
      const second = receipt(await submit('renter_registration', renter(units.flat2B)).expect(201));
      const secondId = (await submissionOf(second.reference)).id;
      await send('post', `/forms/${secondId}/approve`, admin.cookie).send({}).expect(409).expect((r2) => expect(r2.body.code).toBe('tenancy_open_exists'));
      expect((await detail(secondId)).status).toBe('new');
    });

    it('needs the right permissions to approve, and a reason to reject', async () => {
      const approverOnly = await makeUser([{ roleId: await makeRole(['forms:view', 'forms:approve']), scope: tree.blockC.id }]);
      const r = receipt(await submit('renter_registration', renter(units.flat2C)).expect(201));
      const id = (await submissionOf(r.reference)).id;
      expect((await detail(id, approverOnly.cookie)).can).toMatchObject({ approve: false, reject: true });
      await send('post', `/forms/${id}/approve`, approverOnly.cookie).send({}).expect(403);
      await send('post', `/forms/${id}/approve`, admin.cookie).send({ addOwnership: true }).expect(400);
      await send('post', `/forms/${dRenter.id}/approve`, blockCOffice.cookie).send({}).expect(404);

      await send('post', `/forms/${id}/reject`, approverOnly.cookie).send({ note: '' }).expect(400);
      const rejected = formDetailSchema.parse((await send('post', `/forms/${id}/reject`, approverOnly.cookie).send({ note: 'ভুল ফ্ল্যাট' }).expect(200)).body);
      expect(rejected).toMatchObject({ status: 'rejected', reviewNote: 'ভুল ফ্ল্যাট' });
      const audit = await prisma.audit_logs.findFirstOrThrow({ where: { entity_type: 'form_submission', entity_id: id, action: 'reject' } });
      expect(audit.user_id).toBe(approverOnly.id);
    });
  });

  describe('office entry', () => {
    let office: { id: string; cookie: string };

    /** The office types in an application from the dashboard: logged in, CSRF, multipart. */
    function enter(formKey: string, data: unknown, cookie: string, file?: { buffer: Buffer; name: string }) {
      const req = send('post', `/forms/${formKey}`, cookie).field('data', JSON.stringify(data));
      return file ? req.attach('file', file.buffer, file.name) : req;
    }

    beforeAll(async () => {
      office = await makeUser([{ roleId: await makeRole(['forms:view', 'forms:create']), scope: tree.blockC.id }]);
    });

    it('saves it with who entered it, and has no daily limit per phone', async () => {
      const phone = randomPhone();
      const places = [tree.plot14.id, units.flat2A, units.flat2B, units.flat2C];
      const ids: string[] = [];
      // The website stops a phone after three a day; the office may type in more.
      for (const place of places) {
        const res = await enter('membership', membership(place, { phone }), office.cookie, deed()).expect(201);
        ids.push(formEntrySchema.parse(res.body).id);
      }
      const saved = await detail(ids[0]!);
      expect(saved.status).toBe('new');
      expect(saved.enteredBy).toBe(`ব্যবহারকারী ${MARK}`);
      expect(saved.files).toHaveLength(1);
      const list = formListSchema.parse((await get('/forms?pageSize=100', admin.cookie).expect(200)).body);
      expect(list.items.find((item) => item.id === ids[0])?.enteredBy).toBe(`ব্যবহারকারী ${MARK}`);
      const audit = await prisma.audit_logs.findFirstOrThrow({ where: { entity_type: 'form_submission', entity_id: ids[0]! } });
      expect(audit).toMatchObject({ action: 'enter', user_id: office.id });
    });

    it('a renter registration from the website has no one entered by', async () => {
      const res = await submit('renter_registration', renter(units.flat2A)).expect(201);
      const row = await submissionOf(receipt(res).reference);
      expect((await detail(row.id)).enteredBy).toBeNull();
    });

    it('needs the deed, refuses the same open application and places outside the area', async () => {
      const data = renter(units.flat2B);
      const nodeed = await enter('membership', membership(tree.plot14.id), office.cookie).expect(400);
      expect(nodeed.body.code).toBe('file_required');
      await enter('renter_registration', data, office.cookie).expect(201);
      const again = await enter('renter_registration', data, office.cookie).expect(409);
      expect(again.body.code).toBe('already_submitted');
      await enter('renter_registration', renter(units.shopD1), office.cookie).expect(403);
    });

    it('needs forms view and create', async () => {
      const applicantOnly = await makeUser([{ roleId: await makeRole(['forms:create']) }]);
      await enter('renter_registration', renter(units.flat2C), applicantOnly.cookie).expect(403);
      const viewer = await makeUser([{ roleId: await makeRole(['forms:view']) }]);
      await enter('renter_registration', renter(units.flat2C), viewer.cookie).expect(403);
    });
  });
});
