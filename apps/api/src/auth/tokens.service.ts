import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { ENV, type Env } from '../config/env.js';

export const ACCESS_TOKEN_MINUTES = 60;
export const REFRESH_TOKEN_DAYS = 7;

const ISSUER = 's57-api';
const AUDIENCE = 's57';

/** Who is calling, read from a valid access token. */
export type AuthUser = {
  userId: string;
  societyId: string;
  sessionId: string;
};

@Injectable()
export class TokensService {
  private readonly key: Uint8Array;

  constructor(@Inject(ENV) env: Env) {
    this.key = new TextEncoder().encode(env.JWT_SECRET);
  }

  signAccess(user: AuthUser, now = new Date()): Promise<string> {
    const issuedAt = Math.floor(now.getTime() / 1000);
    return new SignJWT({ soc: user.societyId, sid: user.sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ACCESS_TOKEN_MINUTES * 60)
      .sign(this.key);
  }

  /** The caller, or null for a missing, forged, expired or malformed token. */
  async verifyAccess(token: string | undefined): Promise<AuthUser | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      const { sub, soc, sid } = payload;
      if (typeof sub !== 'string' || typeof soc !== 'string' || typeof sid !== 'string') return null;
      return { userId: sub, societyId: soc, sessionId: sid };
    } catch {
      return null;
    }
  }

  /** 256 random bits, URL-safe. Used for refresh and CSRF tokens. */
  randomToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /** Refresh tokens are stored only as this hash. */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
