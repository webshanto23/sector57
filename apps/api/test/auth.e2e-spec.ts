import { INestApplication } from '@nestjs/common';
import { AUTH_COOKIES, CSRF_HEADER, meSchema } from '@s57/shared';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AuthService } from './../src/auth/auth.service.js';
import { PasswordService } from './../src/auth/password.service.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-auth-${Date.now()}`;
const PASSWORD = 'correct horse battery';
const ORIGIN = 'http://localhost:3000';

/** A random, unused-looking Bangladesh mobile number. */
const randomPhone = () => `019${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

// Every test group logs in from its own client IP so the per-IP login limit doesn't interfere.
let ipCounter = 10;
const nextIp = () => `203.0.113.${ipCounter++}`;

type Jar = Record<string, string>;

/** Cookies from a response's Set-Cookie headers (cleared ones removed). */
function updateJar(jar: Jar, res: request.Response): Jar {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  for (const line of header ?? []) {
    const [pair] = line.split(';');
    const [name, ...rest] = pair!.split('=');
    const value = decodeURIComponent(rest.join('='));
    if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(line)) delete jar[name!];
    else jar[name!] = value;
  }
  return jar;
}

const cookieHeader = (jar: Jar) =>
  Object.entries(jar)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  const server = () => app.getHttpServer();

  /** Creates an active user with PASSWORD; returns its id and phone. */
  async function makeUser(status = 'active') {
    const phone = randomPhone();
    const person = await prisma.persons.create({
      data: { society_id: societyId, full_name: `পরীক্ষা ${MARK}`, full_name_en: 'Test User', phone },
    });
    const user = await prisma.users.create({
      data: {
        society_id: societyId,
        person_id: person.id,
        phone,
        status,
        password_hash: await app.get(PasswordService).hash(PASSWORD),
      },
    });
    return { id: user.id, phone };
  }

  const login = (phone: string, password: string, ip: string) =>
    request(server()).post('/auth/login').set('X-Forwarded-For', ip).set('Origin', ORIGIN).send({ phone, password });

  /** Logs in and returns the cookie jar. */
  async function session(phone: string) {
    const res = await login(phone, PASSWORD, nextIp()).expect(200);
    return updateJar({}, res);
  }

  const post = (path: string, jar: Jar, ip = nextIp()) =>
    request(server())
      .post(path)
      .set('X-Forwarded-For', ip)
      .set('Origin', ORIGIN)
      .set('Cookie', cookieHeader(jar))
      .set(CSRF_HEADER, jar[AUTH_COOKIES.csrf] ?? '');

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    societyId = (await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } })).id;
  });

  afterAll(async () => {
    if (prisma) {
      const persons = await prisma.persons.findMany({ where: { full_name: { endsWith: MARK } }, select: { id: true } });
      const users = await prisma.users.findMany({ where: { person_id: { in: persons.map((p) => p.id) } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      await prisma.audit_logs.deleteMany({ where: { OR: [{ user_id: { in: userIds } }, { entity_id: { in: userIds } }] } });
      await prisma.users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.persons.deleteMany({ where: { id: { in: persons.map((p) => p.id) } } });
    }
    await app?.close();
  });

  describe('POST /auth/login', () => {
    it('logs in, sets the three cookies and returns the user', async () => {
      const user = await makeUser();
      const res = await login(user.phone, PASSWORD, nextIp()).expect(200);

      expect(meSchema.parse(res.body)).toMatchObject({ id: user.id, phone: user.phone, nameEn: 'Test User', language: 'bn' });
      const cookies = (res.headers['set-cookie'] as unknown as string[]).join('\n');
      expect(cookies).toMatch(new RegExp(`${AUTH_COOKIES.access}=[^;]+;.*HttpOnly.*SameSite=Lax`));
      expect(cookies).toMatch(new RegExp(`${AUTH_COOKIES.refresh}=[^;]+;.*HttpOnly`));
      expect(cookies).toMatch(new RegExp(`${AUTH_COOKIES.csrf}=[^;]+`));
      expect(cookies).not.toMatch(new RegExp(`${AUTH_COOKIES.csrf}=[^\\n]*HttpOnly`));

      const audit = await prisma.audit_logs.findFirst({ where: { user_id: user.id, action: 'login' } });
      expect(audit?.ip_address).toBeTruthy();
    });

    it('accepts the phone in another format', async () => {
      const user = await makeUser();
      await login(`+88 ${user.phone.slice(0, 5)}-${user.phone.slice(5)}`, PASSWORD, nextIp()).expect(200);
    });

    it('counts down wrong passwords, locks on the fourth, and unlocks after the lock time', async () => {
      const user = await makeUser();
      const ip = nextIp();
      for (const left of [3, 2, 1]) {
        const res = await login(user.phone, 'wrong password', ip).expect(401);
        expect(res.body).toMatchObject({ code: 'invalid_credentials', details: { attemptsLeft: left } });
      }
      const locked = await login(user.phone, 'wrong password', ip).expect(423);
      expect(locked.body.code).toBe('account_locked');
      const until = Date.parse(locked.body.details.lockedUntil);
      expect(until - Date.now()).toBeGreaterThan(59 * 60_000);

      // Even the right password is refused while locked.
      await login(user.phone, PASSWORD, ip).expect(423);

      // Lock over: the right password works and the count is fresh.
      await prisma.users.update({ where: { id: user.id }, data: { locked_until: new Date(Date.now() - 1000) } });
      const wrong = await login(user.phone, 'wrong password', ip).expect(401);
      expect(wrong.body.details.attemptsLeft).toBe(3);
      await login(user.phone, PASSWORD, ip).expect(200);
      const row = await prisma.users.findUniqueOrThrow({ where: { id: user.id } });
      expect(row).toMatchObject({ failed_login_count: 0, locked_until: null });
      expect(await prisma.audit_logs.count({ where: { user_id: user.id, action: 'account_locked' } })).toBe(1);
    });

    it('answers an unknown phone exactly like a real account', async () => {
      const phone = randomPhone();
      const ip = nextIp();
      for (const left of [3, 2, 1]) {
        const res = await login(phone, 'whatever', ip).expect(401);
        expect(res.body).toEqual({
          statusCode: 401,
          code: 'invalid_credentials',
          message: 'Wrong phone number or password',
          details: { attemptsLeft: left },
        });
      }
      const locked = await login(phone, 'whatever', ip).expect(423);
      expect(Object.keys(locked.body.details)).toEqual(['lockedUntil']);
    });

    it('does not let a disabled user in, and says nothing about why', async () => {
      const user = await makeUser('disabled');
      const res = await login(user.phone, PASSWORD, nextIp()).expect(401);
      expect(res.body).toMatchObject({ code: 'invalid_credentials', details: { attemptsLeft: 3 } });
    });

    it('rejects a login posted from another site', async () => {
      const user = await makeUser();
      const res = await request(server())
        .post('/auth/login')
        .set('X-Forwarded-For', nextIp())
        .set('Origin', 'https://evil.example')
        .send({ phone: user.phone, password: PASSWORD })
        .expect(403);
      expect(res.body.code).toBe('origin_not_allowed');
    });

    it('limits login attempts per client IP', async () => {
      const ip = nextIp();
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) statuses.push((await login(randomPhone(), 'x', ip)).status);
      expect(statuses.slice(0, 10)).not.toContain(429);
      expect(statuses[10]).toBe(429);
    });

    it('400s a malformed phone', async () => {
      const res = await login('12345', PASSWORD, nextIp()).expect(400);
      expect(res.body.code).toBe('validation_failed');
    });
  });

  describe('GET /me', () => {
    it('returns the logged-in user', async () => {
      const user = await makeUser();
      const jar = await session(user.phone);
      const res = await request(server()).get('/me').set('Cookie', cookieHeader(jar)).expect(200);
      expect(res.body).toMatchObject({ id: user.id, phone: user.phone });
    });

    it('401s without a token or with a forged one', async () => {
      await request(server()).get('/me').expect(401);
      await request(server()).get('/me').set('Cookie', `${AUTH_COOKIES.access}=forged`).expect(401);
    });

    it("401s a valid token of another society", async () => {
      const user = await makeUser();
      const token = await app.get(TokensService).signAccess({
        userId: user.id,
        societyId: '00000000-0000-4000-8000-000000000000',
        sessionId: '00000000-0000-4000-8000-000000000001',
      });
      await request(server()).get('/me').set('Cookie', `${AUTH_COOKIES.access}=${token}`).expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token and keeps the user logged in', async () => {
      const user = await makeUser();
      const jar = await session(user.phone);
      const oldRefresh = jar[AUTH_COOKIES.refresh];

      updateJar(jar, await post('/auth/refresh', jar).expect(204));
      expect(jar[AUTH_COOKIES.refresh]).toBeDefined();
      expect(jar[AUTH_COOKIES.refresh]).not.toBe(oldRefresh);
      await request(server()).get('/me').set('Cookie', cookieHeader(jar)).expect(200);
    });

    it('needs the CSRF header', async () => {
      const user = await makeUser();
      const jar = await session(user.phone);
      const res = await post('/auth/refresh', jar).set(CSRF_HEADER, 'wrong').expect(403);
      expect(res.body.code).toBe('csrf_failed');
    });

    it('revokes the whole chain when an old refresh token comes back', async () => {
      const user = await makeUser();
      const stolen = await session(user.phone);
      const jar = { ...stolen };
      updateJar(jar, await post('/auth/refresh', jar).expect(204));

      // Past the 30-second grace for parallel tabs.
      await prisma.user_sessions.updateMany({
        where: { user_id: user.id, revoked_at: { not: null } },
        data: { revoked_at: new Date(Date.now() - 60_000) },
      });
      const reuse = await post('/auth/refresh', stolen).expect(401);
      expect(reuse.body.code).toBe('session_expired');

      // The legitimate, newer token is dead too.
      await post('/auth/refresh', jar).expect(401);
      expect(await prisma.user_sessions.count({ where: { user_id: user.id, revoked_at: null } })).toBe(0);
    });

    it('401s without a refresh cookie and for an expired session', async () => {
      await post('/auth/refresh', { [AUTH_COOKIES.csrf]: 'x' }).expect(401);

      const user = await makeUser();
      const jar = await session(user.phone);
      await prisma.user_sessions.updateMany({ where: { user_id: user.id }, data: { expires_at: new Date(Date.now() - 1000) } });
      await post('/auth/refresh', jar).expect(401);
    });

    it('stops refreshing for a user who was disabled', async () => {
      const user = await makeUser();
      const jar = await session(user.phone);
      await prisma.users.update({ where: { id: user.id }, data: { status: 'disabled' } });
      await post('/auth/refresh', jar).expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('ends the session and clears the cookies', async () => {
      const user = await makeUser();
      const jar = await session(user.phone);
      const res = await post('/auth/logout', jar).expect(204);
      const cleared = (res.headers['set-cookie'] as unknown as string[]).join('\n');
      expect(cleared).toContain(`${AUTH_COOKIES.access}=;`);

      await post('/auth/refresh', jar).expect(401);
      expect(await prisma.audit_logs.count({ where: { user_id: user.id, action: 'logout' } })).toBe(1);
    });
  });

  describe('POST /me/password', () => {
    it('changes the password and logs out the other devices', async () => {
      const user = await makeUser();
      const phone = await session(user.phone);
      const laptop = await session(user.phone);

      const wrong = await post('/me/password', phone)
        .send({ currentPassword: 'not it at all', newPassword: 'a brand new one' })
        .expect(400);
      expect(wrong.body.code).toBe('wrong_password');

      await post('/me/password', phone).send({ currentPassword: PASSWORD, newPassword: 'a brand new one' }).expect(204);
      await login(user.phone, PASSWORD, nextIp()).expect(401);
      await login(user.phone, 'a brand new one', nextIp()).expect(200);

      await post('/auth/refresh', laptop).expect(401);
      await post('/auth/refresh', phone).expect(204);
    });

    it('rejects a short new password', async () => {
      const user = await makeUser();
      const jar = await session(user.phone);
      await post('/me/password', jar).send({ currentPassword: PASSWORD, newPassword: 'short' }).expect(400);
    });
  });

  describe('admin password reset (AuthService.resetPassword)', () => {
    it('sets a random password, clears the lock and logs the user out', async () => {
      const user = await makeUser();
      const jar = await session(user.phone);
      await prisma.users.update({ where: { id: user.id }, data: { locked_until: new Date(Date.now() + 3_600_000) } });

      const password = await app.get(AuthService).resetPassword(societyId, user.id, null);
      expect(password).toMatch(/^[A-Za-z2-9]{10}$/);

      await post('/auth/refresh', jar).expect(401);
      await login(user.phone, password, nextIp()).expect(200);
      expect(await prisma.audit_logs.count({ where: { entity_id: user.id, action: 'password_reset' } })).toBe(1);
    });

    it("refuses a user of another society", async () => {
      const user = await makeUser();
      await expect(
        app.get(AuthService).resetPassword('00000000-0000-4000-8000-000000000000', user.id, null),
      ).rejects.toThrow('User not found');
    });
  });

  describe('public routes', () => {
    it('stay open without logging in', async () => {
      await request(server()).get('/health').expect(200);
      await request(server()).get('/society').expect(200);
      await request(server()).get('/public/notices').expect(200);
    });
  });
});
