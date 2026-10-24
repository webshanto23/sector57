import { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  CSRF_HEADER,
  certificateDetailSchema,
  certificateListSchema,
  certificatePrintSchema,
  certificateTemplatesViewSchema,
  certificateUnitPeopleSchema,
  documentPeriod,
  formatDocumentNo,
  type CertificateDetail,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { isoDate, todayDate } from './../src/common/dates.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-certificates-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type Caller = { cookie: string; id: string };

/**
 * Certificates, in a society of its own. Block C has building 9 with flats C-1 and C-2; Block D
 * has flat D-1. Rahim owns building 9 and is member no. 7, Karim rents C-2 and his wife Salma
 * lives there, Jamal owns D-1. The Block C office drafts; the Block C approver issues and voids.
 */
describe('Certificates (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  let firstNo: (no: number) => string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'officeC' | 'approverC' | 'viewerD' | 'nobody', Caller>;
  const ids = {} as Record<'blockC' | 'blockD' | 'c1' | 'c2' | 'd1' | 'rahim' | 'karim' | 'salma' | 'jamal' | 'fund' | 'otherUnit', string>;
  const cert = {} as Record<'sale' | 'membership' | 'residence' | 'noDues' | 'utility', CertificateDetail>;

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
    return { cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}`, id: user.id };
  }

  const send = (method: 'post' | 'patch' | 'put' | 'delete', url: string, caller = users.admin) =>
    request(server())[method](url).set('Cookie', caller.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, caller = users.admin) => request(server()).get(url).set('Cookie', caller.cookie);
  const detail = (res: request.Response) => certificateDetailSchema.parse(res.body);
  const list = async (query: string, caller = users.admin) => certificateListSchema.parse((await get(`/certificates?${query}`, caller).expect(200)).body);
  const draft = (body: object, caller = users.officeC) => send('post', '/certificates', caller).send(body);
  const issue = (id: string, body: object = {}, caller = users.approverC) =>
    send('post', `/certificates/${id}/issue`, caller).send({ signerName: 'সাধারণ সম্পাদক', ...body });

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, name_en: `Society ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);
    const { fiscal_year_start_month } = await prisma.societies.findUniqueOrThrow({ where: { id: societyId } });
    const today = isoDate(todayDate());
    firstNo = (no) => formatDocumentNo('certificate', documentPeriod('certificate', today, fiscal_year_start_month), no);

    const level = (society_id: string, depth: number, name_bn: string, is_unit_level = false) =>
      prisma.location_levels.create({ data: { society_id, depth, name_bn, is_unit_level } }).then((r) => r.id);
    const place = async (society_id: string, levelId: string, name: string, parent: { id: string; path: string } | null) => {
      const id = randomUUID();
      const path = `${parent?.path ?? '/'}${id}/`;
      await prisma.locations.create({ data: { id, society_id, level_id: levelId, parent_id: parent?.id ?? null, name, path } });
      return { id, path };
    };
    const unit = async (society_id: string, levelId: string, name: string, parent: { id: string; path: string }) => {
      const row = await place(society_id, levelId, name, parent);
      await prisma.units.create({ data: { location_id: row.id, society_id, unit_type: 'residential' } });
      return row.id;
    };
    const block = await level(societyId, 1, 'ব্লক');
    const building = await level(societyId, 2, 'ভবন');
    const flat = await level(societyId, 3, 'ইউনিট', true);
    const c = await place(societyId, block, 'ব্লক সি', null);
    const d = await place(societyId, block, 'ব্লক ডি', null);
    const b9 = await place(societyId, building, 'ভবন ৯', c);
    const bD = await place(societyId, building, 'ভবন ১', d);
    ids.blockC = c.id;
    ids.blockD = d.id;
    ids.c1 = await unit(societyId, flat, 'সি-১', b9);
    ids.c2 = await unit(societyId, flat, 'সি-২', b9);
    ids.d1 = await unit(societyId, flat, 'ডি-১', bD);
    ids.fund = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'সাধারণ তহবিল', is_default: true } })).id;

    const person = (full_name: string, full_name_en: string | null = null) =>
      prisma.persons.create({ data: { society_id: societyId, full_name, full_name_en, phone: randomPhone() } }).then((r) => r.id);
    ids.rahim = await person('রহিম', 'Rahim');
    ids.karim = await person('করিম');
    ids.salma = await person('সালমা');
    ids.jamal = await person('জামাল');
    const own = (location_id: string, person_id: string) => prisma.ownerships.create({ data: { society_id: societyId, location_id, person_id, start_date: day('2020-01-01') } });
    await own(b9.id, ids.rahim);
    await own(ids.d1, ids.jamal);
    await prisma.memberships.create({ data: { society_id: societyId, person_id: ids.rahim, member_no: 7, joined_on: day('2021-01-01') } });
    const tenancy = await prisma.tenancies.create({
      data: { society_id: societyId, unit_id: ids.c2, renter_type: 'family', primary_person_id: ids.karim, start_date: day('2025-01-01'), status: 'active' },
    });
    await prisma.occupants.create({ data: { society_id: societyId, unit_id: ids.c2, person_id: ids.salma, tenancy_id: tenancy.id, relation: 'spouse', start_date: day('2025-01-01') } });

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;
    const otherBlock = await level(otherSocietyId, 1, 'ব্লক');
    const otherFlat = await level(otherSocietyId, 2, 'ইউনিট', true);
    ids.otherUnit = await unit(otherSocietyId, otherFlat, 'এ-১', await place(otherSocietyId, otherBlock, 'ব্লক এ', null));

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    users.officeC = await makeUser(['certificates:view', 'certificates:create', 'certificates:edit', 'certificates:delete', 'billing:view'], ids.blockC);
    users.approverC = await makeUser(['certificates:view', 'certificates:approve'], ids.blockC);
    users.viewerD = await makeUser(['certificates:view'], ids.blockD);
    users.nobody = await makeUser([]);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    // Issued certificates go only with the society (their trigger allows that cascade), and they
    // hold on to their people and units, so those go with it too.
    await prisma.invoices.deleteMany({ where: { society_id: societies } });
    await prisma.memberships.deleteMany({ where: { society_id: societies } });
    await prisma.occupants.deleteMany({ where: { society_id: societies } });
    await prisma.tenancies.deleteMany({ where: { society_id: societies } });
    await prisma.ownerships.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  it('lists who a certificate at a unit may be for, in the caller area only', async () => {
    const people = certificateUnitPeopleSchema.parse((await get(`/certificates/unit-people?unitId=${ids.c2}`, users.officeC).expect(200)).body);
    expect(Object.fromEntries(people.items.map((p) => [p.name, p.ties]))).toEqual({ করিম: ['renter'], রহিম: ['owner'], সালমা: ['resident'] });
    await get(`/certificates/unit-people?unitId=${ids.d1}`, users.officeC).expect(404);
    await get(`/certificates/unit-people?unitId=${ids.otherUnit}`).expect(404);
    await get(`/certificates/unit-people?unitId=${ids.c2}`, users.nobody).expect(403);
  });

  it('drafts a certificate only for someone tied to the unit as the type needs', async () => {
    const renterSale = await draft({ type: 'noc_sale', unitId: ids.c2, personId: ids.karim }).expect(409);
    expect(renterSale.body.code).toBe('certificate_person_not_at_unit');
    expect((await draft({ type: 'membership', unitId: ids.c2, personId: ids.karim }).expect(409)).body.code).toBe('certificate_not_member');
    expect((await draft({ type: 'residence', unitId: ids.c1, personId: randomUUID() }).expect(404)).body.code).toBe('person_not_found');

    cert.sale = detail(await draft({ type: 'noc_sale', unitId: ids.c1, personId: ids.rahim, addressee: ' ব্যবস্থাপক, ক ব্যাংক ', purpose: 'ফ্ল্যাট বিক্রয়' }).expect(201));
    expect(cert.sale).toMatchObject({
      certNo: null,
      status: 'draft',
      lang: 'bn',
      addressee: 'ব্যবস্থাপক, ক ব্যাংক',
      dues: { owed: '0.00', bills: 0 },
      can: { edit: true, delete: true, issue: false, void: false },
    });
    // The owner of the building above the flat counts; the letter names the unit first.
    expect(cert.sale.body).toContain('রহিম সি-১, ভবন ৯, ব্লক সি-এর মালিক');
    expect(cert.sale.body).toContain(`সমিতি ${MARK}`);

    cert.membership = detail(await draft({ type: 'membership', unitId: ids.c1, personId: ids.rahim }).expect(201));
    expect(cert.membership.body).toContain('সদস্য নম্বর: ৭');
    cert.residence = detail(await draft({ type: 'residence', unitId: ids.c2, personId: ids.salma }).expect(201));
    cert.noDues = detail(await draft({ type: 'no_dues', unitId: ids.c1, personId: ids.rahim }).expect(201));
    cert.utility = detail(await draft({ type: 'noc_utility', unitId: ids.c2, personId: ids.karim }).expect(201));

    expect((await draft({ type: 'residence', unitId: ids.d1, personId: ids.jamal }).expect(404)).body.code).toBe('unit_not_found');
    await draft({ type: 'residence', unitId: ids.c2, personId: ids.salma }, users.approverC).expect(403);
    await draft({ type: 'residence', unitId: ids.otherUnit, personId: ids.salma }, users.admin).expect(404);

    const audit = await prisma.audit_logs.findFirst({ where: { entity_id: cert.sale.id, action: 'create' } });
    expect(audit?.after_data).toMatchObject({ type: 'noc_sale', personId: ids.rahim, unitId: ids.c1 });
  });

  it('shows certificates in the caller area only, and searches by name or phone', async () => {
    const office = await list('', users.officeC);
    expect(office.total).toBe(5);
    expect(office.counts).toEqual({ draft: 5, issued: 0, void: 0 });
    expect((await list('', users.viewerD)).total).toBe(0);
    await get(`/certificates/${cert.sale.id}`, users.viewerD).expect(404);
    await get('/certificates', users.nobody).expect(403);

    expect((await list(`q=${encodeURIComponent('সালমা')}`)).items.map((c) => c.id)).toEqual([cert.residence.id]);
    const phone = (await prisma.persons.findUniqueOrThrow({ where: { id: ids.karim } })).phone!;
    expect((await list(`q=${phone.slice(-6)}`)).items.map((c) => c.id)).toEqual([cert.utility.id]);
    expect((await list(`unitId=${ids.c2}&type=residence`)).items.map((c) => c.id)).toEqual([cert.residence.id]);
    expect((await list(`personId=${ids.rahim}`)).total).toBe(3);
  });

  it('edits a draft, checking a new person again', async () => {
    const edit = (id: string, body: object, caller = users.officeC) => send('patch', `/certificates/${id}`, caller).send(body);
    const english = detail(await edit(cert.sale.id, { lang: 'en' }).expect(200));
    expect(english.body).toBe(`This is to certify that Rahim is the owner of সি-১, ভবন ৯, ব্লক সি. Society ${MARK} has no objection to the sale of this unit.`);
    expect((await edit(cert.sale.id, { personId: ids.karim }).expect(409)).body.code).toBe('certificate_person_not_at_unit');
    await edit(cert.sale.id, { lang: 'bn' }, users.approverC).expect(403);
    await edit(cert.sale.id, { lang: 'bn' }).expect(200);
  });

  it('holds back issuing while bills are unpaid, unless allowed; never for a no-dues certificate', async () => {
    await prisma.invoices.create({
      data: { society_id: societyId, invoice_no: `${MARK}-1`, unit_id: ids.c1, bill_to_person_id: ids.rahim, fund_id: ids.fund, due_date: day('2026-01-10'), total: '2500.50', paid: '500.25', status: 'partial' },
    });
    expect(detail(await get(`/certificates/${cert.sale.id}`, users.officeC).expect(200)).dues).toEqual({ owed: '2000.25', bills: 1 });
    expect(detail(await get(`/certificates/${cert.sale.id}`, users.approverC).expect(200)).dues).toBeNull();

    await issue(cert.sale.id, {}, users.officeC).expect(403);
    const held = await issue(cert.sale.id).expect(409);
    expect(held.body).toMatchObject({ code: 'certificate_dues_unpaid', details: { owed: '2000.25' } });
    const blocked = await issue(cert.noDues.id, { allowDues: true }).expect(409);
    expect(blocked.body).toMatchObject({ code: 'certificate_dues_outstanding', details: { owed: '2000.25' } });
    expect(await prisma.document_sequences.count({ where: { society_id: societyId, kind: 'certificate' } })).toBe(0);

    cert.sale = detail(await issue(cert.sale.id, { allowDues: true, signerTitle: 'সাধারণ সম্পাদক, কার্যনির্বাহী কমিটি' }).expect(200));
    expect(cert.sale).toMatchObject({
      certNo: firstNo(1),
      status: 'issued',
      signerName: 'সাধারণ সম্পাদক',
      duesOwedAtIssue: '2000.25',
      issuedBy: { id: users.approverC.id },
      dues: null,
      can: { edit: false, delete: false, issue: false, void: true },
    });
    const audit = await prisma.audit_logs.findFirst({ where: { entity_id: cert.sale.id, action: 'issue' } });
    expect(audit?.after_data).toMatchObject({ certNo: firstNo(1), duesOwed: '2000.25', allowDues: true });
  });

  it('freezes an issued certificate: no edits, no second issue, no delete', async () => {
    expect((await send('patch', `/certificates/${cert.sale.id}`, users.officeC).send({ purpose: 'অন্য' }).expect(409)).body.code).toBe('certificate_not_draft');
    expect((await issue(cert.sale.id).expect(409)).body.code).toBe('certificate_not_draft');
    expect((await send('delete', `/certificates/${cert.sale.id}`, users.officeC).expect(409)).body.code).toBe('certificate_not_draft');

    // The database refuses too.
    await expect(prisma.certificates.update({ where: { id: cert.sale.id }, data: { body: 'বদলানো' } })).rejects.toThrow();
    await expect(prisma.certificates.delete({ where: { id: cert.sale.id } })).rejects.toThrow();
  });

  it('checks the person again at issue, and numbers two issued together without a gap', async () => {
    await prisma.occupants.updateMany({ where: { person_id: ids.salma }, data: { end_date: day('2026-01-01') } });
    expect((await issue(cert.residence.id).expect(409)).body.code).toBe('certificate_person_not_at_unit');

    // C-1 still owes its bill; C-2 owes nothing.
    const [a, b] = await Promise.all([issue(cert.membership.id, { allowDues: true }), issue(cert.utility.id)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([detail(a).certNo, detail(b).certNo].sort()).toEqual([firstNo(2), firstNo(3)]);
    expect(detail(a).body).toContain('সদস্য নম্বর: ৭');
  });

  it('prints an issued certificate only, in its own language, with the header', async () => {
    expect((await get(`/certificates/${cert.residence.id}/print`).expect(409)).body.code).toBe('certificate_not_issued');
    const print = certificatePrintSchema.parse((await get(`/certificates/${cert.sale.id}/print`, users.approverC).expect(200)).body);
    expect(print).toMatchObject({
      certNo: firstNo(1),
      status: 'issued',
      lang: 'bn',
      society: `সমিতি ${MARK}`,
      addressee: 'ব্যবস্থাপক, ক ব্যাংক',
      purpose: 'ফ্ল্যাট বিক্রয়',
      body: cert.sale.body,
      signerTitle: 'সাধারণ সম্পাদক, কার্যনির্বাহী কমিটি',
      issuedOn: isoDate(todayDate()),
    });
    expect(print.header.mark).not.toBe('');
    await get(`/certificates/${cert.sale.id}/print`, users.viewerD).expect(404);
  });

  it('voids an issued certificate once, with a reason; the paper says so', async () => {
    const voidIt = (id: string, caller = users.approverC) => send('post', `/certificates/${id}/void`, caller).send({ reason: 'ভুল ব্যক্তির নামে' });
    expect((await voidIt(cert.residence.id).expect(409)).body.code).toBe('certificate_not_issued');
    await voidIt(cert.sale.id, users.officeC).expect(403);
    await send('post', `/certificates/${cert.sale.id}/void`, users.approverC).send({ reason: ' ' }).expect(400);

    const voided = detail(await voidIt(cert.sale.id).expect(200));
    expect(voided).toMatchObject({ status: 'void', voidReason: 'ভুল ব্যক্তির নামে', voidedBy: { id: users.approverC.id }, certNo: firstNo(1), can: { void: false } });
    expect((await voidIt(cert.sale.id).expect(409)).body.code).toBe('certificate_already_void');
    expect(certificatePrintSchema.parse((await get(`/certificates/${cert.sale.id}/print`).expect(200)).body).status).toBe('void');
    expect((await list('', users.officeC)).counts).toEqual({ draft: 2, issued: 2, void: 1 });
    await expect(prisma.certificates.update({ where: { id: cert.sale.id }, data: { void_reason: 'অন্য' } })).rejects.toThrow();
  });

  it('discards a draft, which leaves no number behind', async () => {
    await send('delete', `/certificates/${cert.residence.id}`, users.approverC).expect(403);
    await send('delete', `/certificates/${cert.residence.id}`, users.officeC).expect(204);
    await get(`/certificates/${cert.residence.id}`).expect(404);
    expect(await prisma.audit_logs.count({ where: { entity_id: cert.residence.id, action: 'delete' } })).toBe(1);
    expect(await prisma.certificates.count({ where: { society_id: societyId, cert_no: { not: null } } })).toBe(3);
  });

  it('keeps letter templates as a setting: drafts follow them, issued certificates keep their text', async () => {
    const view = certificateTemplatesViewSchema.parse((await get('/certificates/templates', users.officeC).expect(200)).body);
    expect(view.customised).toEqual([]);
    expect(view.can.edit).toBe(false);

    const own = { bn: '{name} ({unit}) এর কাছে {society}-এর পাওনা নেই, {date}।', en: 'Nothing owed by {name} at {unit}.' };
    await send('put', '/certificates/templates', users.officeC).send({ no_dues: own }).expect(403);
    await send('put', '/certificates/templates').send({ no_dues: { bn: '{নাম} {nme}', en: 'x' } }).expect(400);
    const saved = certificateTemplatesViewSchema.parse((await send('put', '/certificates/templates').send({ no_dues: own }).expect(200)).body);
    expect(saved.customised).toEqual(['no_dues']);
    expect(saved.templates.no_dues).toEqual(own);
    expect(saved.templates.residence).toEqual(saved.defaults.residence);

    expect(detail(await get(`/certificates/${cert.noDues.id}`).expect(200)).body).toMatch(/^রহিম \(সি-১, ভবন ৯, ব্লক সি\) এর কাছে সমিতি .+-এর পাওনা নেই, .+।$/);
    expect(detail(await get(`/certificates/${cert.membership.id}`).expect(200)).body).toContain('সদস্য নম্বর: ৭');
    expect(await prisma.audit_logs.count({ where: { society_id: societyId, entity_type: 'setting', action: 'update' } })).toBe(1);
  });
});
