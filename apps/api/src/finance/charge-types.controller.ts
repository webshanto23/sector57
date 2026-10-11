import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { chargeTypeInputSchema, chargeTypeListSchema, chargeTypeSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { ChargeTypesService } from './charge-types.service.js';

export class ChargeTypeDto extends createDto(chargeTypeSchema) {}
export class ChargeTypeListDto extends createDto(chargeTypeListSchema) {}
export class ChargeTypeInputDto extends createDto(chargeTypeInputSchema) {}

/**
 * What bills can charge for. Anyone who may view bills may read them; changes need a
 * society-wide billing role. No deletes: a charge type is archived. The service audits every write.
 */
@Controller('charge-types')
@SkipAudit()
export class ChargeTypesController {
  constructor(private readonly chargeTypes: ChargeTypesService) {}

  @Get()
  @Can('billing', 'view')
  @ZodResponse({ status: 200, type: ChargeTypeListDto })
  list(@CurrentSociety() society: SocietyContext) {
    return this.chargeTypes.list(society.id);
  }

  @Post()
  @Can('billing', 'create')
  @ZodResponse({ status: 201, type: ChargeTypeDto })
  create(@CurrentActor() actor: Actor, @Body() body: ChargeTypeInputDto) {
    return this.chargeTypes.create(actor, body);
  }

  @Put(':id')
  @Can('billing', 'edit')
  @ZodResponse({ status: 200, type: ChargeTypeDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: ChargeTypeInputDto) {
    return this.chargeTypes.update(actor, id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @Can('billing', 'edit')
  @ZodResponse({ status: 200, type: ChargeTypeDto })
  archive(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.chargeTypes.setArchived(actor, id, true);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @Can('billing', 'edit')
  @ZodResponse({ status: 200, type: ChargeTypeDto })
  restore(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.chargeTypes.setArchived(actor, id, false);
  }
}
