import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { bulkResultSchema, locationBulkSchema, locationCreateSchema, locationUpdateSchema, locationViewSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { LocationsService } from './locations.service.js';

export class LocationViewDto extends createDto(locationViewSchema) {}
export class LocationCreateDto extends createDto(locationCreateSchema) {}
export class LocationUpdateDto extends createDto(locationUpdateSchema) {}
export class LocationBulkDto extends createDto(locationBulkSchema) {}
export class BulkResultDto extends createDto(bulkResultSchema) {}

/** The property tree above the units. The service checks every row against the caller's area and writes the audit rows. */
@Controller('locations')
@SkipAudit()
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  /** The top of the tree the caller may see. */
  @Get()
  @Can('locations', 'view')
  @ZodResponse({ status: 200, type: LocationViewDto })
  top(@CurrentActor() actor: Actor) {
    return this.locations.top(actor);
  }

  @Get(':id')
  @Can('locations', 'view')
  @ZodResponse({ status: 200, type: LocationViewDto })
  view(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.locations.view(actor, id);
  }

  @Post()
  @Can('locations', 'create')
  @ZodResponse({ status: 201, type: LocationViewDto })
  create(@CurrentActor() actor: Actor, @Body() body: LocationCreateDto) {
    return this.locations.create(actor, body);
  }

  /** Many locations of one level under one parent, all or none. */
  @Post('bulk')
  @Can('locations', 'create')
  @ZodResponse({ status: 201, type: BulkResultDto })
  bulk(@CurrentActor() actor: Actor, @Body() body: LocationBulkDto) {
    return this.locations.bulk(actor, body);
  }

  @Patch(':id')
  @Can('locations', 'edit')
  @ZodResponse({ status: 200, type: LocationViewDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: LocationUpdateDto) {
    return this.locations.update(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('locations', 'delete')
  async remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<void> {
    await this.locations.remove(actor, id);
  }
}
