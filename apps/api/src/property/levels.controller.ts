import { Body, Controller, Get, Put } from '@nestjs/common';
import { levelsInputSchema, locationLevelSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { Authenticated, Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { LevelsService } from './levels.service.js';

export class LocationLevelListDto extends createDto(z.object({ items: z.array(locationLevelSchema) })) {}
export class LevelsInputDto extends createDto(levelsInputSchema) {}

/** The levels of the property tree. Their names are no secret: any logged-in user may read them. */
@Controller('location-levels')
@SkipAudit()
export class LevelsController {
  constructor(private readonly levels: LevelsService) {}

  @Get()
  @Authenticated()
  @ZodResponse({ status: 200, type: LocationLevelListDto })
  async list(@CurrentSociety() society: SocietyContext) {
    return { items: await this.levels.list(society.id) };
  }

  /** The whole list, top level first; the last one holds the units. */
  @Put()
  @Can('settings', 'edit')
  @ZodResponse({ status: 200, type: LocationLevelListDto })
  async replace(@CurrentActor() actor: Actor, @Body() body: LevelsInputDto) {
    return { items: await this.levels.replace(actor, body) };
  }
}
