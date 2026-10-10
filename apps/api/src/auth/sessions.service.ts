import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { toInet } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REFRESH_TOKEN_DAYS, TokensService } from './tokens.service.js';

export type ClientMeta = { ip?: string | null; userAgent?: string | null };

/**
 * A refresh token revoked this recently is not treated as stolen: two tabs that
 * refresh at the same moment both send the same token, and one of them loses.
 */
const ROTATION_GRACE_MS = 30_000;

const DAY_MS = 24 * 60 * 60 * 1000;

export type RotatedSession = { userId: string; sessionId: string; refreshToken: string };

const sessionExpired = () =>
  new UnauthorizedException({ code: 'session_expired', message: 'Please log in again' });

/** Refresh-token sessions in `user_sessions`. Tokens are stored only as SHA-256 hashes. */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  /** A new login: a new session family. */
  async start(user: { id: string; society_id: string }, meta: ClientMeta, now = new Date()) {
    const refreshToken = this.tokens.randomToken();
    const session = await this.prisma.user_sessions.create({
      data: {
        society_id: user.society_id,
        user_id: user.id,
        family_id: randomUUID(),
        token_hash: this.tokens.hashToken(refreshToken),
        expires_at: new Date(now.getTime() + REFRESH_TOKEN_DAYS * DAY_MS),
        ip_address: toInet(meta.ip),
        user_agent: meta.userAgent?.slice(0, 500) ?? null,
      },
      select: { id: true },
    });
    return { sessionId: session.id, refreshToken };
  }

  /**
   * Swaps a refresh token for a new one in the same family; the 7 days start again.
   * A token that was already swapped (outside the grace period) means a copy is in
   * someone else's hands: the whole family is revoked and both sides must log in again.
   */
  async rotate(refreshToken: string | undefined, societyId: string, meta: ClientMeta, now = new Date()): Promise<RotatedSession> {
    if (!refreshToken) throw sessionExpired();
    const session = await this.prisma.user_sessions.findUnique({
      where: { token_hash: this.tokens.hashToken(refreshToken) },
      include: { users: { select: { status: true } } },
    });
    if (!session || session.society_id !== societyId) throw sessionExpired();

    if (session.revoked_at) {
      if (now.getTime() - session.revoked_at.getTime() > ROTATION_GRACE_MS) await this.revokeFamily(session.family_id, now);
      throw sessionExpired();
    }
    if (session.expires_at <= now || session.users.status !== 'active') {
      await this.revoke(session.id, now);
      throw sessionExpired();
    }

    const nextToken = this.tokens.randomToken();
    const next = await this.prisma.$transaction(async (tx) => {
      // Only one of two concurrent refreshes can revoke the old row.
      const { count } = await tx.user_sessions.updateMany({
        where: { id: session.id, revoked_at: null },
        data: { revoked_at: now, last_used_at: now },
      });
      if (count === 0) return null;
      return tx.user_sessions.create({
        data: {
          society_id: session.society_id,
          user_id: session.user_id,
          family_id: session.family_id,
          token_hash: this.tokens.hashToken(nextToken),
          expires_at: new Date(now.getTime() + REFRESH_TOKEN_DAYS * DAY_MS),
          ip_address: toInet(meta.ip),
          user_agent: meta.userAgent?.slice(0, 500) ?? null,
        },
        select: { id: true },
      });
    });
    if (!next) throw sessionExpired();
    return { userId: session.user_id, sessionId: next.id, refreshToken: nextToken };
  }

  /** The live session a refresh token belongs to, if any (for logout). */
  async findByToken(refreshToken: string | undefined) {
    if (!refreshToken) return null;
    return this.prisma.user_sessions.findFirst({
      where: { token_hash: this.tokens.hashToken(refreshToken), revoked_at: null },
      select: { id: true, user_id: true, society_id: true },
    });
  }

  async revoke(sessionId: string, now = new Date()): Promise<void> {
    await this.prisma.user_sessions.updateMany({ where: { id: sessionId, revoked_at: null }, data: { revoked_at: now } });
  }

  /** Logs a user out everywhere, optionally keeping the session making the request. */
  async revokeAllForUser(userId: string, exceptSessionId?: string, now = new Date()): Promise<void> {
    await this.prisma.user_sessions.updateMany({
      where: { user_id: userId, revoked_at: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revoked_at: now },
    });
  }

  private async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.user_sessions.updateMany({ where: { family_id: familyId, revoked_at: null }, data: { revoked_at: now } });
  }
}
