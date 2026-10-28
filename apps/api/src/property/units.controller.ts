import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  unitAreasQuery,
  unitAreasSchema,
  unitBulkSchema,
  unitCreateSchema,
  unitDetailSchema,
  unitListQuery,
  unitListSchema,
  unitStoreysInputSchema,
  unitTypeBulkSchema,
  unitCombineSchema,
  unitUpdateSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { BulkResultDto } from './locations.controller.js';
import { CombineService } from './combine.service.js';
import { LayoutService } from './layout.service.js';
import { UnitsService } from './units.service.js';

export class UnitDetailDto extends createDto(unitDetailSchema) {}
export class UnitListDto extends createDto(unitListSchema) {}
export class UnitListQueryDto extends createDto(unitListQuery) {}
export class UnitAreasDto extends createDto(unitAreasSchema) {}
export class UnitAreasQueryDto extends createDto(unitAreasQuery) {}
export class UnitCreateDto extends createDto(unitCreateSchema) {}
export class UnitUpdateDto extends createDto(unitUpdateSchema) {}
export class UnitBulkDto extends createDto(unitBulkSchema) {}
export class UnitStoreysDto extends createDto(unitStoreysInputSchema) {}
export class UnitCombineDto extends createDto(unitCombineSchema) {}
export class UnitCombineResultDto extends createDto(z.object({ keptId: z.uuid(), merged: z.number().int().min(1) })) {}
export class UnitTypeBulkDto extends createDto(unitTypeBulkSchema) {}
export class UnitTypeBulkResultDto extends createDto(z.object({ updated: z.number().int().min(0) })) {}

/** Flats, shops and offices. The service checks every row against the caller's area and writes the audit rows. */
@Controller('units')
@SkipAudit()
export class UnitsController {
  constructor(
    private readonly units: UnitsService,
    private readonly layout: LayoutService,
    private readonly combiner: CombineService,
  ) {}

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

  /** Combines units into one (3A + 4A into a duplex): the kept one carries on, the others become history. */
  @Post('combine')
  @HttpCode(200)
  @Can('units', 'edit')
  @ZodResponse({ status: 200, type: UnitCombineResultDto })
  combine(@CurrentActor() actor: Actor, @Body() body: UnitCombineDto) {
    return this.combiner.combine(actor, body);
  }

  /** One type for many units (ground-floor shops in the building grid), all or none. */
  @Post('bulk-type')
  @HttpCode(200)
  @Can('units', 'edit')
  @ZodResponse({ status: 200, type: UnitTypeBulkResultDto })
  bulkType(@CurrentActor() actor: Actor, @Body() body: UnitTypeBulkDto) {
    return this.layout.setTypes(actor, body);
  }

  @Patch(':id')
  @Can('units', 'edit')
  @ZodResponse({ status: 200, type: UnitDetailDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: UnitUpdateDto) {
    return this.units.update(actor, id, body);
  }

  /** The other storeys the unit covers (a duplex): replaces the whole list. */
  @Put(':id/storeys')
  @Can('units', 'edit')
  @ZodResponse({ status: 200, type: UnitDetailDto })
  setStoreys(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: UnitStoreysDto) {
    return this.units.setStoreys(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('units', 'delete')
  async remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<void> {
    await this.units.remove(actor, id);
  }
}
