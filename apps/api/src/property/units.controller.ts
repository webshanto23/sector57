import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  unitAreasQuery,
  unitAreasSchema,
  unitBulkSchema,
  unitCreateSchema,
  unitDetailSchema,
  unitListQuery,
  unitListSchema,
  unitUpdateSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { BulkResultDto } from './locations.controller.js';
import { UnitsService } from './units.service.js';

export class UnitDetailDto extends createDto(unitDetailSchema) {}
export class UnitListDto extends createDto(unitListSchema) {}
export class UnitListQueryDto extends createDto(unitListQuery) {}
export class UnitAreasDto extends createDto(unitAreasSchema) {}
export class UnitAreasQueryDto extends createDto(unitAreasQuery) {}
export class UnitCreateDto extends createDto(unitCreateSchema) {}
export class UnitUpdateDto extends createDto(unitUpdateSchema) {}
export class UnitBulkDto extends createDto(unitBulkSchema) {}

/** Flats, shops and offices. The service checks every row against the caller's area and writes the audit rows. */
@Controller('units')
@SkipAudit()
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  @Can('units', 'view')
  @ZodResponse({ status: 200, type: UnitListDto })
  list(@CurrentActor() actor: Actor, @Query() query: UnitListQueryDto) {
    return this.units.list(actor, query);
  }

  /** The list's area picker, for callers with the `units` permission only. */
  @Get('areas')
  @Can('units', 'view')
  @ZodResponse({ status: 200, type: UnitAreasDto })
  areas(@CurrentActor() actor: Actor, @Query() { parentId }: UnitAreasQueryDto) {
    return this.units.areas(actor, parentId);
  }

  @Get(':id')
  @Can('units', 'view')
  @ZodResponse({ status: 200, type: UnitDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.units.get(actor, id);
  }

  @Post()
  @Can('units', 'create')
  @ZodResponse({ status: 201, type: UnitDetailDto })
  create(@CurrentActor() actor: Actor, @Body() body: UnitCreateDto) {
    return this.units.create(actor, body);
  }

  /** Many units with the same facts under one parent, all or none. */
  @Post('bulk')
  @Can('units', 'create')
  @ZodResponse({ status: 201, type: BulkResultDto })
  bulk(@CurrentActor() actor: Actor, @Body() body: UnitBulkDto) {
    return this.units.bulk(actor, body);
  }

  @Patch(':id')
  @Can('units', 'edit')
  @ZodResponse({ status: 200, type: UnitDetailDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: UnitUpdateDto) {
    return this.units.update(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('units', 'delete')
  async remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<void> {
    await this.units.remove(actor, id);
  }
}
