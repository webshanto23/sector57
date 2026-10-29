import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ChangePasswordInput, LoginInput, Me } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { mediaUrl } from '../common/media.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { afterFailure, type AttemptResult, UnknownPhoneAttempts } from './login-attempts.js';
import { PasswordService } from './password.service.js';
import { type ClientMeta, SessionsService } from './sessions.service.js';
import { type AuthUser, TokensService } from './tokens.service.js';

/** What a successful login or refresh hands to the controller to put in cookies. */
export type IssuedTokens = { accessToken: string; refreshToken: string; csrfToken: string };

export const meSelect = {
  id: true,
  phone: true,
  language: true,
  persons: { select: { full_name: true, full_name_en: true, photo_url: true, verified_at: true } },
} as const;

type MeRow = {
  id: string;
  phone: string;
  language: string;
  persons: { full_name: string; full_name_en: string | null; photo_url: string | null; verified_at: Date | null } | null;
};

export function toMe(user: MeRow, mediaBaseUrl: string | undefined): Me {
  return {
    id: user.id,
    phone: user.phone,
    name: user.persons?.full_name ?? null,
    nameEn: user.persons?.full_name_en ?? null,
    photoUrl: mediaUrl(user.persons?.photo_url, mediaBaseUrl),
    nameLocked: user.persons?.verified_at != null,
    language: user.language === 'en' ? 'en' : 'bn',
  };
}

function loginFailed(result: AttemptResult): HttpException {
  if (result.locked) {
    return new HttpException(
      {
        code: 'account_locked',
        message: 'Too many wrong passwords. Try again later.',
        details: { lockedUntil: result.lockedUntil.toISOString() },
      },
      HttpStatus.LOCKED,
    );
  }
  return new UnauthorizedException({
    code: 'invalid_credentials',
    message: 'Wrong phone number or password',
    details: { attemptsLeft: result.attemptsLeft },
  });
}

@Injectable()
export class AuthService {
  private readonly unknownPhones = new UnknownPhoneAttempts();

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Phone + password login with lockout. A phone without an active account gets
   * the same answers as a real one, in the same time, so accounts can't be probed.
   */
  async login(societyId: string, input: LoginInput, meta: ClientMeta, now = new Date()): Promise<{ me: Me; tokens: IssuedTokens }> {
    const user = await this.prisma.users.findUnique({
      where: { society_id_phone: { society_id: societyId, phone: input.phone } },
      select: { ...meSelect, society_id: true, status: true, password_hash: true, locked_until: true },
    });
    const auditBase = { societyId, entityType: 'user', ip: meta.ip };

    if (!user || user.status !== 'active' || !user.password_hash) {
      const key = `${societyId}:${input.phone}`;
      const lockedUntil = this.unknownPhones.lockedUntil(key, now);
      if (lockedUntil) throw loginFailed({ locked: true, lockedUntil });
      await this.passwords.verifyDummy(input.password);
      const result = this.unknownPhones.fail(key, now);
      await this.audit.recordQuietly({
        ...auditBase,
        userId: user?.id,
        entityId: user?.id,
        action: 'login_failed',
        after: { phone: input.phone, reason: user ? `status_${user.status}` : 'unknown_phone' },
      });
      throw loginFailed(result);
    }

    if (user.locked_until && user.locked_until > now) {
      throw loginFailed({ locked: true, lockedUntil: user.locked_until });
    }

    if (!(await this.passwords.verify(user.password_hash, input.password))) {
      // Increment in the database so parallel attempts can't share one count.
      const { failed_login_count } = await this.prisma.users.update({
        where: { id: user.id },
        data: { failed_login_count: { increment: 1 } },
        select: { failed_login_count: true },
      });
      const result = afterFailure(failed_login_count - 1, now);
      if (result.locked) {
        await this.prisma.users.update({
          where: { id: user.id },
          data: { failed_login_count: 0, locked_until: result.lockedUntil },
        });
      }
      await this.audit.recordQuietly({
        ...auditBase,
        userId: user.id,
        entityId: user.id,
        action: result.locked ? 'account_locked' : 'login_failed',
        after: { reason: 'wrong_password' },
      });
      throw loginFailed(result);
    }

    await this.prisma.users.update({
      where: { id: user.id },
      data: { failed_login_count: 0, locked_until: null, last_login_at: now },
    });
    const session = await this.sessions.start(user, meta, now);
    await this.audit.record({ ...auditBase, userId: user.id, entityId: user.id, action: 'login' });
    return {
      me: toMe(user, this.env.MEDIA_BASE_URL),
      tokens: await this.issue({ userId: user.id, societyId, sessionId: session.sessionId }, session.refreshToken, now),
    };
  }

  /** New access, refresh and CSRF tokens for a valid refresh token. */
  async refresh(societyId: string, refreshToken: string | undefined, meta: ClientMeta, now = new Date()): Promise<IssuedTokens> {
    const session = await this.sessions.rotate(refreshToken, societyId, meta, now);
    return this.issue({ userId: session.userId, societyId, sessionId: session.sessionId }, session.refreshToken, now);
  }

  /** Ends the session of this browser. Safe to call when already logged out. */
  async logout(societyId: string, refreshToken: string | undefined, caller: AuthUser | null, meta: ClientMeta): Promise<void> {
    const session = await this.sessions.findByToken(refreshToken);
    const sessionId = session?.society_id === societyId ? session.id : caller?.sessionId;
    const userId = session?.society_id === societyId ? session.user_id : caller?.userId;
    if (!sessionId || !userId) return;
    await this.sessions.revoke(sessionId);
    await this.audit.record({ societyId, userId, entityType: 'user', entityId: userId, action: 'logout', ip: meta.ip });
  }

  async me(caller: AuthUser): Promise<Me> {
    const user = await this.prisma.users.findFirst({
      where: { id: caller.userId, society_id: caller.societyId, status: 'active' },
      select: meSelect,
    });
    if (!user) throw new UnauthorizedException({ code: 'unauthenticated', message: 'Please log in' });
    return toMe(user, this.env.MEDIA_BASE_URL);
  }

  /** The user changes their own password; their other devices are logged out. */
  async changePassword(caller: AuthUser, input: ChangePasswordInput, meta: ClientMeta): Promise<void> {
    const user = await this.prisma.users.findFirst({
      where: { id: caller.userId, society_id: caller.societyId, status: 'active' },
      select: { id: true, password_hash: true },
    });
    if (!user) throw new UnauthorizedException({ code: 'unauthenticated', message: 'Please log in' });
    if (!user.password_hash || !(await this.passwords.verify(user.password_hash, input.currentPassword))) {
      throw new BadRequestException({ code: 'wrong_password', message: 'The current password is wrong' });
    }

    await this.prisma.users.update({
      where: { id: user.id },
      data: { password_hash: await this.passwords.hash(input.newPassword) },
    });
    await this.sessions.revokeAllForUser(user.id, caller.sessionId);
    await this.audit.record({
      societyId: caller.societyId,
      userId: user.id,
      entityType: 'user',
      entityId: user.id,
      action: 'password_change',
      ip: meta.ip,
    });
  }

  /**
   * Admin reset: a random password, shown once to the admin. Clears the lock and
   * logs the user out everywhere. Used by the `reset-password` CLI now and by the
   * user details page in Step 6 (behind a permission check there).
   */
  async resetPassword(societyId: string, userId: string, actorUserId: string | null, meta: ClientMeta = {}): Promise<string> {
    const user = await this.prisma.users.findFirst({ where: { id: userId, society_id: societyId }, select: { id: true } });
    if (!user) throw new NotFoundException({ code: 'user_not_found', message: 'User not found' });

    const password = this.passwords.random();
    await this.prisma.users.update({
      where: { id: user.id },
      data: { password_hash: await this.passwords.hash(password), failed_login_count: 0, locked_until: null },
    });
    await this.sessions.revokeAllForUser(user.id);
    await this.audit.record({
      societyId,
      userId: actorUserId,
      entityType: 'user',
      entityId: user.id,
      action: 'password_reset',
      ip: meta.ip,
    });
    return password;
  }

  private async issue(user: AuthUser, refreshToken: string, now: Date): Promise<IssuedTokens> {
    return {
      accessToken: await this.tokens.signAccess(user, now),
      refreshToken,
      csrfToken: this.tokens.randomToken(),
    };
  }
}
