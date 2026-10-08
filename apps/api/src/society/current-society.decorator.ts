import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import type { Request } from 'express';
import type { SocietyContext } from './society.service.js';

declare module 'express' {
  interface Request {
    society?: SocietyContext;
  }
}

/** The society of the current request. Every business query must filter by its `id`. */
export const CurrentSociety = createParamDecorator((_data: unknown, context: ExecutionContext): SocietyContext => {
  const society = context.switchToHttp().getRequest<Request>().society;
  // Only reachable if a handler marked @NoSociety() asks for the society: a coding error.
  if (!society) throw new InternalServerErrorException('Society context missing');
  return society;
});
