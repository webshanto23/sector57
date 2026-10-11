import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AUTH_COOKIES } from '@s57/shared';
import type { Request, Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { ENV, type Env } from '../config/env.js';
import type { CallerAccess } from '../permissions/caller-access.js';
import { Authenticated, CurrentAccess } from '../permissions/permissions.decorators.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { clearAuthCookies, readCookie, setAuthCookies } from './auth-cookies.js';
import { CurrentUser, Public, SkipCsrf } from './auth.decorators.js';
import { ChangePasswordDto, LoginDto, MeDto, MeWithAccessDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';
import type { ClientMeta } from './sessions.service.js';
import { TokensService } from './tokens.service.js';
import type { AuthUser } from './tokens.service.js';

const clientMeta = (request: Request): ClientMeta => ({
  ip: request.ip ?? null,
  userAgent: request.headers['user-agent'] ?? null,
});

/** Login, token refresh and logout. Tokens travel only in httpOnly cookies. The service writes the audit rows. */
@Controller('auth')
@Public()
@SkipAudit()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** 401 `invalid_credentials` with `details.attemptsLeft`; 423 `account_locked` with `details.lockedUntil`. */
  @Post('login')
  @HttpCode(200)
  @SkipCsrf()
  // Per client IP (the lockout already limits each phone).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ZodResponse({ status: 200, type: MeDto })
  async login(
    @CurrentSociety() society: SocietyContext,
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { me, tokens } = await this.auth.login(society.id, body, clientMeta(request));
    setAuthCookies(response, this.env, tokens);
    return me;
  }

  /** Swaps the refresh cookie for new tokens. 401 `session_expired` means: log in again. */
  @Post('refresh')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @CurrentSociety() society: SocietyContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    try {
      const tokens = await this.auth.refresh(society.id, readCookie(request, AUTH_COOKIES.refresh), clientMeta(request));
      setAuthCookies(response, this.env, tokens);
    } catch (error) {
      clearAuthCookies(response, this.env);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentSociety() society: SocietyContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    // Public so an expired access token can still log out; the refresh cookie names the session.
    const caller = await this.tokens.verifyAccess(readCookie(request, AUTH_COOKIES.access));
    await this.auth.logout(society.id, readCookie(request, AUTH_COOKIES.refresh), caller, clientMeta(request));
    clearAuthCookies(response, this.env);
  }
}

/** The logged-in user's own account: open to every logged-in user, whatever their roles. */
@Controller('me')
@Authenticated()
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  @ZodResponse({ status: 200, type: MeWithAccessDto })
  async me(@CurrentUser() user: AuthUser, @CurrentAccess() access: CallerAccess) {
    return { ...(await this.auth.me(user)), access: access.toJSON() };
  }

  /** 400 `wrong_password` when the current password is wrong. Other devices are logged out. */
  @Post('password')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @SkipAudit()
  async changePassword(@CurrentUser() user: AuthUser, @Body() body: ChangePasswordDto, @Req() request: Request): Promise<void> {
    await this.auth.changePassword(user, body, clientMeta(request));
  }
}
