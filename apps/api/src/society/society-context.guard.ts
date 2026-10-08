import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SocietyService } from './society.service.js';

const SKIP_SOCIETY = 'skipSociety';

/** For routes that do not belong to any society, such as `/health`. */
export const NoSociety = () => SetMetadata(SKIP_SOCIETY, true);

/**
 * Global guard that attaches the current society to every request, so each
 * handler can scope its queries with `@CurrentSociety()`.
 */
@Injectable()
export class SocietyContextGuard implements CanActivate {
  constructor(
    private readonly societies: SocietyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SOCIETY, [context.getHandler(), context.getClass()]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest<Request>();
    request.society = await this.societies.resolve(this.societies.slugFor(request));
    return true;
  }
}
