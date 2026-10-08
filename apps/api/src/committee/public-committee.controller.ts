import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { committeeSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { createDto } from '../common/create-dto.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { CommitteeService } from './committee.service.js';

export class CommitteeDto extends createDto(committeeSchema) {}

/** Managing committee page of the public website. */
@Controller('public/committee')
// Called by the Next.js server, so every visitor shares one IP here; per-visitor limits belong in Nginx.
@SkipThrottle()
export class PublicCommitteeController {
  constructor(private readonly committee: CommitteeService) {}

  @Get()
  @ZodResponse({ status: 200, type: CommitteeDto })
  current(@CurrentSociety() society: SocietyContext) {
    return this.committee.current(society.id);
  }
}
