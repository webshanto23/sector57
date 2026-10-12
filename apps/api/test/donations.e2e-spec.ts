import { INestApplication } from '@nestjs/common';
import {
  addMoney,
  AUTH_COOKIES,
  CSRF_HEADER,
  donationDetailSchema,
  donationListSchema,
  donationOptionsSchema,
  donorLookupSchema,
  handoverSchema,
  normaliseMoney,
  paymentDetailSchema,
  paymentListSchema,
  paymentPrintSchema,
  SETTING_KEYS,
  subtractMoney,
  type DonationDetail,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-don-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

type Caller = { cookie: string; id: string };

/**
 * Donations in a society of its own (ledger rows can't be deleted). Rahim is a person on
 * record, "আল-আমিন ট্রাস্ট" an organisation. Funds: general (default), mosque, and a closed one.
 */
describe('Donations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'clerk' | 'clerk2' | 'viewer' | 'approver' | 'treasurer' | 'nobody', Caller>;
  const ids = {} as Record<'general' | 'mosque' | 'closed' | 'rahim' | 'rahimPhone' | 'trust' | 'otherPerson' | 'otherFund', string>;

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
  const give = (body: object, caller = users.clerk) => send('post', '/donations', caller).send(body);
  const given = async (body: object, caller = users.clerk): Promise<DonationDetail> => donationDetailSchema.parse((await give(body, caller).expect(201)).body);
  const anonymous = { kind: 'anonymous' };
  const separateFunds = (on: boolean) =>
    prisma.society_settings.upsert({
      where: { society_id_key: { society_id: societyId, key: SETTING_KEYS.separateFacilityFunds } },
      create: { society_id: societyId, key: SETTING_KEYS.separateFacilityFunds, value: on },
      update: { value: on },
    });
  /** In minus out of the donation rows in the ledger, for one fund or all. */
  const ledgerFromDonations = async (fundId?: string) => {
    const rows = await prisma.ledger_entries.groupBy({
      by: ['direction'],
      where: { society_id: societyId, source_type: 'donation', ...(fundId ? { fund_id: fundId } : {}) },
      _sum: { amount: true },
    });
    const sum = (direction: string) => rows.find((row) => row.direction === direction)?._sum.amount?.toFixed(2) ?? '0.00';
    return subtractMoney(sum('in'), sum('out'));
  };

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);

    ids.general = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'সাধারণ তহবিল', is_default: true } })).id;
    ids.mosque = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'মসজিদ তহবিল', name_en: 'Mosque fund' } })).id;
    ids.closed = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'পুরোনো তহবিল', closed_at: new Date() } })).id;
    ids.rahimPhone = randomPhone();
    ids.rahim = (await prisma.persons.create({ data: { society_id: societyId, full_name: 'রহিম উদ্দিন', phone: ids.rahimPhone } })).id;
    ids.trust = (await prisma.organisations.create({ data: { society_id: societyId, name: 'আল-আমিন ট্রাস্ট' } })).id;

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;
    ids.otherPerson = (await prisma.persons.create({ data: { society_id: otherSocietyId, full_name: 'রহিম অন্য', phone: randomPhone() } })).id;
    ids.otherFund = (await prisma.funds.create({ data: { society_id: otherSocietyId, name_bn: 'অন্য তহবিল', is_default: true } })).id;

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    users.clerk = await makeUser(['donations:view', 'donations:create']);
    users.clerk2 = await makeUser(['donations:view', 'donations:create']);
    users.viewer = await makeUser(['donations:view']);
    users.approver = await makeUser(['donations:view', 'donations:approve']);
    users.treasurer = await makeUser(['payments:view', 'payments:approve']);
    users.nobody = await makeUser([]);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    // Ledger rows go only with the society (the trigger allows that cascade).
    await prisma.donations.deleteMany({ where: { society_id: societies } });
    await prisma.payments.deleteMany({ where: { society_id: societies } });
    await prisma.cash_handovers.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societies } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  describe('recording', () => {
    it('issues a receipt with no bills and writes one ledger row in the fund, not two', async () => {
      const made = await given({ donor: { kind: 'person', id: ids.rahim }, amount: '০.১০', purpose: 'মসজিদ সংস্কার', note: 'ঈদের আগে' });
      expect(made).toMatchObject({
        amount: '0.10',
        purpose: 'মসজিদ সংস্কার',
        fund: { id: ids.general },
        voided: false,
        donor: { kind: 'person', id: ids.rahim, name: 'রহিম উদ্দিন', phone: ids.rahimPhone, unit: null },
        collectedBy: { id: users.clerk.id },
      });
      expect(made.receiptNo).toMatch(/^RC-\d{5}$/);
      expect(made.receipt).toMatchObject({ kind: 'donation', receiptNo: made.receiptNo, allocations: [], note: 'ঈদের আগে', donation: { id: made.id } });
      expect(made.can.void).toBe(true);

      const second = await given({ donor: anonymous, amount: '0.20' });
      expect(second.donor).toBeNull();
      expect(second.receipt.payer).toBeNull();

      const entries = await prisma.ledger_entries.findMany({ where: { society_id: societyId, source_id: { in: [made.id, made.paymentId] } } });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ source_type: 'donation', direction: 'in', account: 'cash', fund_id: ids.general, memo: made.receiptNo });
      expect(await prisma.ledger_entries.count({ where: { society_id: societyId, source_type: 'payment' } })).toBe(0);
      expect(await ledgerFromDonations()).toBe('0.30');
    });

    it('takes an organisation, and finds a new donor by phone before adding one', async () => {
      const trust = await given({ donor: { kind: 'organisation', id: ids.trust }, amount: '5000' });
      expect(trust.donor).toMatchObject({ kind: 'organisation', id: ids.trust, name: 'আল-আমিন ট্রাস্ট' });

      // Rahim's phone, typed with another name: Rahim is reused, not duplicated.
      const reused = await given({ donor: { kind: 'new', fullName: 'অন্য নাম', phone: ids.rahimPhone }, amount: '100' });
      expect(reused.donor).toMatchObject({ id: ids.rahim, name: 'রহিম উদ্দিন' });

      const phone = randomPhone();
      const added = await given({ donor: { kind: 'new', fullName: 'নতুন দাতা', fullNameEn: 'New Donor', phone }, amount: '250.50' });
      const person = await prisma.persons.findFirstOrThrow({ where: { society_id: societyId, phone } });
      expect(added.donor).toMatchObject({ kind: 'person', id: person.id, name: 'নতুন দাতা', nameEn: 'New Donor' });
      const audit = await prisma.audit_logs.findFirstOrThrow({ where: { society_id: societyId, entity_type: 'donation', entity_id: added.id } });
      expect(audit.after_data).toMatchObject({ donor: { kind: 'person', id: person.id, added: true }, amount: '250.50' });
    });

    it('keeps the donor on the receipt as on the day', async () => {
      const before = await given({ donor: { kind: 'person', id: ids.rahim }, amount: '10' });
      await prisma.persons.update({ where: { id: ids.rahim }, data: { full_name: 'রহিম উদ্দিন আহমেদ' } });
      const again = donationDetailSchema.parse((await get(`/donations/${before.id}`).expect(200)).body);
      expect(again.donor?.name).toBe('রহিম উদ্দিন');
      await prisma.persons.update({ where: { id: ids.rahim }, data: { full_name: 'রহিম উদ্দিন' } });
    });

    it('uses only the default fund while separate funds are off, and never a closed one', async () => {
      expect((await give({ donor: anonymous, amount: '10', fundId: ids.mosque }).expect(400)).body.code).toBe('invalid_fund');
      const options = donationOptionsSchema.parse((await get('/donations/options', users.clerk).expect(200)).body);
      expect(options.separateFunds).toBe(false);
      expect(options.funds.map((f) => f.id)).toEqual([ids.general]);

      await separateFunds(true);
      const mosque = await given({ donor: anonymous, amount: '300', fundId: ids.mosque, purpose: 'মসজিদ সংস্কার' });
      expect(mosque.fund).toEqual({ id: ids.mosque, nameBn: 'মসজিদ তহবিল', nameEn: 'Mosque fund' });
      expect((await give({ donor: anonymous, amount: '10', fundId: ids.closed }).expect(409)).body.code).toBe('fund_closed');
      expect((await give({ donor: anonymous, amount: '10', fundId: ids.otherFund }).expect(400)).body.code).toBe('invalid_fund');
      const wide = donationOptionsSchema.parse((await get('/donations/options', users.clerk).expect(200)).body);
      expect(wide.funds.map((f) => f.id)).toEqual([ids.general, ids.mosque]);
      expect(wide.purposes[0]).toBe('মসজিদ সংস্কার');
      await separateFunds(false);
      expect(await ledgerFromDonations(ids.mosque)).toBe('300.00');
    });

    it('refuses bad input and another society’s donor', async () => {
      for (const amount of ['0', '-1', '1.005', 'abc']) await give({ donor: anonymous, amount }).expect(400);
      expect((await give({ donor: { kind: 'person', id: ids.otherPerson }, amount: '10' }).expect(400)).body.code).toBe('donor_not_found');
      expect((await give({ donor: { kind: 'organisation', id: randomUUID() }, amount: '10' }).expect(400)).body.code).toBe('donor_not_found');
      await give({ donor: anonymous, amount: '10' }, users.viewer).expect(403);
      await give({ donor: anonymous, amount: '10' }, users.treasurer).expect(403);
    });

    it('gives concurrent receipts distinct numbers without gaps, shared with bill payments', async () => {
      const made = await Promise.all([1, 2, 3, 4, 5].map(() => given({ donor: anonymous, amount: '1' })));
      const numbers = made.map((d) => Number(d.receiptNo.slice(3))).sort((a, b) => a - b);
      expect(new Set(numbers).size).toBe(5);
      expect(numbers[4]! - numbers[0]!).toBe(4);
      const sequence = await prisma.document_sequences.findFirstOrThrow({ where: { society_id: societyId, kind: 'receipt' } });
      expect(Number(sequence.next_no) - 1).toBe(numbers[4]);
    });
  });

  describe('finding donors', () => {
    it('finds people and organisations of this society by name or phone, with no NID', async () => {
      const byName = donorLookupSchema.parse((await get(`/donations/donors?q=${encodeURIComponent('রহিম')}`, users.clerk).expect(200)).body);
      expect(byName.donors.map((d) => d.id)).toContain(ids.rahim);
      expect(byName.donors.map((d) => d.id)).not.toContain(ids.otherPerson);
      expect(Object.keys(byName.donors[0]!).sort()).toEqual(['id', 'kind', 'name', 'nameEn', 'phone']);
      const bnPhone = ids.rahimPhone.slice(-6).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]!);
      const byPhone = donorLookupSchema.parse((await get(`/donations/donors?q=${encodeURIComponent(bnPhone)}`, users.clerk).expect(200)).body);
      expect(byPhone.donors.map((d) => d.id)).toEqual([ids.rahim]);
      const org = donorLookupSchema.parse((await get(`/donations/donors?q=${encodeURIComponent('ট্রাস্ট')}`, users.clerk).expect(200)).body);
      expect(org.donors).toEqual([expect.objectContaining({ kind: 'organisation', id: ids.trust })]);
      await get('/donations/donors?q=র', users.clerk).expect(400);
      await get(`/donations/donors?q=${encodeURIComponent('রহিম')}`, users.viewer).expect(403);
    });
  });

  describe('reading', () => {
    it('lists with totals by fund and purpose that match the rows', async () => {
      const list = donationListSchema.parse((await get('/donations?pageSize=100', users.viewer).expect(200)).body);
      const valid = list.items.filter((d) => !d.voided);
      expect(list.totals.amount).toBe(addMoney('0', ...valid.map((d) => d.amount)));
      expect(list.totals.count).toBe(valid.length);
      expect(addMoney('0', ...list.totals.byFund.map((f) => f.amount))).toBe(list.totals.amount);
      expect(addMoney('0', ...list.totals.byPurpose.map((p) => p.amount))).toBe(list.totals.amount);
      expect(list.totals.byPurpose.find((p) => p.purpose === 'মসজিদ সংস্কার')?.amount).toBe('300.10');
      // Rahim, the trust and the new donor.
      expect(list.totals.donors).toBe(3);
      expect(list.summary.month.amount).toBe(list.totals.amount);
      expect(list.summary.fiscalYear).toMatchObject({ amount: list.totals.amount, donors: 3 });

      const rahim = donationListSchema.parse((await get(`/donations?personId=${ids.rahim}`, users.viewer).expect(200)).body);
      expect(rahim.items.length).toBe(3);
      expect(rahim.items.every((d) => d.donor?.id === ids.rahim)).toBe(true);
      const mosque = donationListSchema.parse((await get(`/donations?fundId=${ids.mosque}`, users.viewer).expect(200)).body);
      expect(mosque.items.map((d) => d.amount)).toEqual(['300.00']);
      const purpose = donationListSchema.parse((await get(`/donations?purpose=${encodeURIComponent(' মসজিদ  সংস্কার ')}`, users.viewer).expect(200)).body);
      expect(purpose.total).toBe(2);
      const search = donationListSchema.parse((await get(`/donations?q=${encodeURIComponent('ট্রাস্ট')}`, users.viewer).expect(200)).body);
      expect(search.items.map((d) => d.donor?.id)).toEqual([ids.trust]);

      await get('/donations', users.nobody).expect(403);
      await get('/donations', users.treasurer).expect(403);
    });

    it('keeps each society to itself', async () => {
      // A donation in the other society, written directly.
      const otherUser = await prisma.users.create({ data: { society_id: otherSocietyId, phone: randomPhone(), status: 'active' } });
      const receipt = await prisma.payments.create({
        data: { society_id: otherSocietyId, receipt_no: 'RC-00001', amount: '99', received_by: otherUser.id },
      });
      const other = await prisma.donations.create({
        data: { society_id: otherSocietyId, fund_id: ids.otherFund, amount: '99', payment_id: receipt.id, donor_person_id: ids.otherPerson },
      });
      await get(`/donations/${other.id}`).expect(404);
      await send('post', `/donations/${other.id}/print`).expect(404);
      await send('post', `/donations/${other.id}/void`).send({ reason: 'x' }).expect(404);
      const list = donationListSchema.parse((await get('/donations?pageSize=100').expect(200)).body);
      expect(list.items.map((d) => d.id)).not.toContain(other.id);
      const byPerson = donationListSchema.parse((await get(`/donations?personId=${ids.otherPerson}`).expect(200)).body);
      expect(byPerson.total).toBe(0);
      await get(`/payments/${receipt.id}`).expect(404);
    });

    it('shows donation receipts among the receipts only to society-wide payment viewers', async () => {
      const receipts = paymentListSchema.parse((await get('/payments?pageSize=100', users.treasurer).expect(200)).body);
      const donations = receipts.items.filter((p) => p.kind === 'donation');
      expect(donations.length).toBe(receipts.items.length);
      const [one] = donations;
      const detail = paymentDetailSchema.parse((await get(`/payments/${one!.id}`, users.treasurer).expect(200)).body);
      expect(detail.donation).not.toBeNull();
      // A payments approver can't void it from the receipt: donations have one void path.
      expect((await send('post', `/payments/${one!.id}/void`, users.treasurer).send({ reason: 'x' }).expect(409)).body.code).toBe('use_donation_void');
      expect(detail.can.void).toBe(false);
    });

    it('prints the original once, then duplicates', async () => {
      const made = await given({ donor: anonymous, amount: '15' });
      expect(paymentPrintSchema.parse((await send('post', `/donations/${made.id}/print`, users.viewer).expect(200)).body)).toEqual({ copy: 'original', printCount: 1 });
      expect(paymentPrintSchema.parse((await send('post', `/donations/${made.id}/print`, users.viewer).expect(200)).body)).toEqual({ copy: 'duplicate', printCount: 2 });
      await send('post', `/donations/${made.id}/print`, users.nobody).expect(403);
    });

    it('has no delete route: donations are only voided', async () => {
      const [first] = donationListSchema.parse((await get('/donations').expect(200)).body).items;
      await send('delete', `/donations/${first!.id}`).expect(404);
    });
  });

  describe('voiding', () => {
    it('lets the collector void on the day, and reverses the ledger row', async () => {
      const made = await given({ donor: anonymous, amount: '77.70', fundId: null });
      const before = await ledgerFromDonations();
      // Someone else who may only take donations can't.
      expect((await send('post', `/donations/${made.id}/void`, users.clerk2).send({ reason: 'ভুল' }).expect(403)).body.code).toBe('void_needs_approval');
      await send('post', `/donations/${made.id}/void`, users.clerk).send({}).expect(400);
      const voided = donationDetailSchema.parse((await send('post', `/donations/${made.id}/void`, users.clerk).send({ reason: 'ভুল অঙ্ক' }).expect(200)).body);
      expect(voided).toMatchObject({ voided: true, can: { void: false } });
      expect(voided.receipt.void).toMatchObject({ reason: 'ভুল অঙ্ক' });
      expect(await ledgerFromDonations()).toBe(subtractMoney(before, '77.70'));
      const reversal = await prisma.ledger_entries.findFirstOrThrow({ where: { source_type: 'donation', source_id: made.id, direction: 'out' } });
      expect(reversal.reverses_id).not.toBeNull();
      expect((await send('post', `/donations/${made.id}/void`, users.clerk).send({ reason: 'আবার' }).expect(409)).body.code).toBe('already_void');
    });

    it('needs donations.approve after the day', async () => {
      const made = await given({ donor: anonymous, amount: '20' });
      await prisma.payments.update({ where: { id: made.paymentId }, data: { received_at: new Date(Date.now() - 2 * 86_400_000) } });
      await send('post', `/donations/${made.id}/void`, users.clerk).send({ reason: 'ভুল' }).expect(403);
      await send('post', `/donations/${made.id}/void`, users.treasurer).send({ reason: 'ভুল' }).expect(403);
      await send('post', `/donations/${made.id}/void`, users.approver).send({ reason: 'ভুল' }).expect(200);
    });
  });

  describe('handover', () => {
    it('hands donation cash over with bill payments, lowers the expected amount on a void, and needs a society-wide approver', async () => {
      // A clerk who takes only donations closes their day too.
      const kept = await given({ donor: anonymous, amount: '40' }, users.clerk2);
      const dropped = await given({ donor: anonymous, amount: '10' }, users.clerk2);
      const handover = handoverSchema.parse((await send('post', '/handovers', users.clerk2).expect(201)).body);
      expect(handover).toMatchObject({ status: 'pending', expected: '50.00', paymentCount: 2 });
      expect(handoverSchema.parse((await get(`/handovers/${handover.id}`, users.clerk2).expect(200)).body).id).toBe(handover.id);

      // In a handover the clerk can no longer void; an approver can, and the expected cash drops.
      await send('post', `/donations/${dropped.id}/void`, users.clerk2).send({ reason: 'ভুল' }).expect(403);
      await send('post', `/donations/${dropped.id}/void`, users.approver).send({ reason: 'ভুল' }).expect(200);
      const after = handoverSchema.parse((await get(`/handovers/${handover.id}`, users.treasurer).expect(200)).body);
      expect(after.expected).toBe('40.00');
      expect(after.can.confirm).toBe(true);

      await send('post', `/handovers/${handover.id}/confirm`, users.clerk2).send({ amountCounted: '40' }).expect(403);
      const confirmed = handoverSchema.parse((await send('post', `/handovers/${handover.id}/confirm`, users.treasurer).send({ amountCounted: '40' }).expect(200)).body);
      expect(confirmed).toMatchObject({ status: 'confirmed', expected: '40.00', difference: '0.00' });
      const stamped = await prisma.payments.findUniqueOrThrow({ where: { id: kept.paymentId } });
      expect(stamped.handed_over_at).not.toBeNull();
      // Once handed over, voiding needs an approver.
      expect(donationDetailSchema.parse((await get(`/donations/${kept.id}`, users.clerk2).expect(200)).body).can.void).toBe(false);

      await send('post', '/handovers', users.viewer).expect(403);
      await get('/handovers', users.viewer).expect(403);
    });
  });

  describe('the ledger', () => {
    it('agrees with the donations that aren’t void, and refuses edits', async () => {
      const [{ sum }] = await prisma.$queryRaw<{ sum: string }[]>`
        SELECT coalesce(sum(d.amount), 0)::text AS sum FROM donations d JOIN payments p ON p.id = d.payment_id
        WHERE d.society_id = ${societyId}::uuid AND p.voided_at IS NULL`;
      expect(await ledgerFromDonations()).toBe(normaliseMoney(sum));
      const row = await prisma.ledger_entries.findFirstOrThrow({ where: { society_id: societyId, source_type: 'donation' } });
      await expect(prisma.ledger_entries.update({ where: { id: row.id }, data: { memo: 'x' } })).rejects.toThrow();
    });

    it('refuses a donation without a receipt and one with two donors', async () => {
      await expect(
        prisma.donations.create({ data: { society_id: societyId, fund_id: ids.general, amount: '1', payment_id: undefined as unknown as string } }),
      ).rejects.toThrow();
      const receipt = await prisma.payments.findFirstOrThrow({ where: { society_id: societyId } });
      await expect(
        prisma.$executeRaw`INSERT INTO donations (society_id, donor_person_id, donor_organisation_id, fund_id, amount, payment_id)
          VALUES (${societyId}::uuid, ${ids.rahim}::uuid, ${ids.trust}::uuid, ${ids.general}::uuid, 1, ${receipt.id}::uuid)`,
      ).rejects.toThrow();
    });
  });
});
