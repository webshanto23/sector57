import { Body, Controller, Get, Put } from '@nestjs/common';
import { unitTypeSchema, unitTypesInputSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { Authenticated, Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { UnitTypesService } from './unit-types.service.js';

export class UnitTypeListDto extends createDto(z.object({ items: z.array(unitTypeSchema) })) {}
export class UnitTypesInputDto extends createDto(unitTypesInputSchema) {}

/** The society's unit types. Like the levels, any logged-in user may read them; editing needs settings.edit. */
@Controller('unit-types')
@SkipAudit()
export class UnitTypesController {
  constructor(private readonly types: UnitTypesService) {}

  @Get()
  @Authenticated()
  @ZodResponse({ status: 200, type: UnitTypeListDto })
  async list(@CurrentSociety() society: SocietyContext) {
    return { items: await this.types.list(society.id) };
  }

  /** The whole list in display order. */
  @Put()
  @Can('settings', 'edit')
  @ZodResponse({ status: 200, type: UnitTypeListDto })
  async replace(@CurrentActor() actor: Actor, @Body() body: UnitTypesInputDto) {
    return { items: await this.types.replace(actor, body) };
  }
}
