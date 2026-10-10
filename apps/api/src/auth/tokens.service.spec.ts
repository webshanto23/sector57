import { SignJWT } from 'jose';
import type { Env } from '../config/env.js';
import { TokensService } from './tokens.service.js';

const env = { JWT_SECRET: 'a'.repeat(32) } as Env;
const user = {
  userId: '2b1f0f8e-7d5a-4c4b-9f55-8d0e0e6c1a01',
  societyId: '7e0b9a3c-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  sessionId: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c',
};

describe('TokensService', () => {
  const tokens = new TokensService(env);

  it('round-trips an access token', async () => {
    await expect(tokens.verifyAccess(await tokens.signAccess(user))).resolves.toEqual(user);
  });

  it('rejects an expired token', async () => {
    const token = await tokens.signAccess(user, new Date(Date.now() - 61 * 60 * 1000));
    await expect(tokens.verifyAccess(token)).resolves.toBeNull();
  });

  it('rejects a token signed with another secret', async () => {
    const other = new TokensService({ JWT_SECRET: 'b'.repeat(32) } as Env);
    await expect(tokens.verifyAccess(await other.signAccess(user))).resolves.toBeNull();
  });

  it('rejects another algorithm, a token without issuer, and garbage', async () => {
    const forged = await new SignJWT({ soc: user.societyId, sid: user.sessionId })
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject(user.userId)
      .sign(new TextEncoder().encode('a'.repeat(32)));
    await expect(tokens.verifyAccess(forged)).resolves.toBeNull();
    await expect(tokens.verifyAccess('garbage')).resolves.toBeNull();
    await expect(tokens.verifyAccess(undefined)).resolves.toBeNull();
  });

  it('hashes tokens deterministically and makes unique random ones', () => {
    const token = tokens.randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokens.randomToken()).not.toBe(token);
    expect(tokens.hashToken(token)).toBe(tokens.hashToken(token));
    expect(tokens.hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});
