import { Controller, Get } from '@nestjs/common';
import { overviewSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { createDto } from '../common/create-dto.js';
import { Authenticated, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { OverviewService } from './overview.service.js';

export class OverviewDto extends createDto(overviewSchema) {}

/** The dashboard's first page: open to every logged-in user, each card only with its grant. */
@Controller('overview')
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  @Authenticated()
  @ZodResponse({ status: 200, type: OverviewDto })
  get(@CurrentActor() actor: Actor) {
    return this.overview.get(actor);
  }
}
