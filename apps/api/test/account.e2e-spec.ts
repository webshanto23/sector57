import { INestApplication } from '@nestjs/common';
import { AUTH_COOKIES, CSRF_HEADER, meSchema, meWithAccessSchema } from '@s57/shared';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-acct-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const photo = () => sharp({ create: { width: 12, height: 8, channels: 3, background: '#88aacc' } }).png().toBuffer();

type Caller = { cookie: string; id: string };

/** The user's own name and photo on /account: no permission needed, only their own person. */
describe('Own account (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  const server = () => app.getHttpServer();

  async function makeUser(phone = randomPhone(), personId: string | null = null): Promise<Caller> {
    const user = await prisma.users.create({ data: { society_id: societyId, phone, status: 'active', person_id: personId } });
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}`, id: user.id };
  }

  const send = (method: 'patch' | 'post' | 'delete', url: string, caller: Caller) =>
    request(server())[method](url).set('Cookie', caller.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const rename = (caller: Caller, body: object) => send('patch', '/me', caller).send(body);
  const personOf = async (caller: Caller) =>
    (await prisma.users.findUniqueOrThrow({ where: { id: caller.id }, select: { persons: true } })).persons;

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.societies.deleteMany({ where: { id: societyId } });
    await app.close();
  });

  it('gives a login without a person one on the first save, then renames that person', async () => {
    const user = await makeUser();
    await send('post', '/me/photo', user).attach('file', await photo(), 'me.png').expect(409, /name_required/);

    const me = meSchema.parse((await rename(user, { name: 'রহিম উদ্দিন', nameEn: ' Rahim ' }).expect(200)).body);
    expect(me).toMatchObject({ name: 'রহিম উদ্দিন', nameEn: 'Rahim', photoUrl: null, nameLocked: false });
    const created = await personOf(user);
    expect(created).toMatchObject({ full_name: 'রহিম উদ্দিন', full_name_en: 'Rahim' });

    await rename(user, { name: 'রহিম উদ্দীন', nameEn: '' }).expect(200);
    expect(await personOf(user)).toMatchObject({ id: created!.id, full_name: 'রহিম উদ্দীন', full_name_en: null });
    await rename(user, { name: '  ' }).expect(400);
  });

  it('reuses the person who already has the login phone', async () => {
    const phone = randomPhone();
    const person = await prisma.persons.create({ data: { society_id: societyId, full_name: 'করিম', phone } });
    const user = await makeUser(phone);
    await rename(user, { name: 'করিম মিয়া' }).expect(200);
    expect(await personOf(user)).toMatchObject({ id: person.id, full_name: 'করিম মিয়া' });
  });

  it('sets and removes the photo, and locks only the name once the person is verified', async () => {
    const person = await prisma.persons.create({ data: { society_id: societyId, full_name: 'সালমা', phone: randomPhone() } });
    const user = await makeUser(randomPhone(), person.id);

    await send('post', '/me/photo', user).attach('file', await photo(), 'me.png').expect(200);
    const key = (await personOf(user))!.photo_url;
    expect(key).toMatch(new RegExp(`^${societyId}/people/`));

    await prisma.persons.update({ where: { id: person.id }, data: { verified_at: new Date() } });
    const me = meWithAccessSchema.parse((await request(server()).get('/me').set('Cookie', user.cookie).expect(200)).body);
    expect(me.nameLocked).toBe(true);
    await rename(user, { name: 'অন্য নাম' }).expect(409, /name_locked/);
    expect((await personOf(user))!.full_name).toBe('সালমা');

    await send('delete', '/me/photo', user).expect(200);
    expect((await personOf(user))!.photo_url).toBeNull();
    expect(await prisma.audit_logs.count({ where: { entity_id: person.id, action: { in: ['photo_set', 'photo_remove'] } } })).toBe(2);
  });

  it('needs a login', async () => {
    await request(server()).patch('/me').set('Origin', ORIGIN).send({ name: 'x' }).expect(401);
  });
});
