import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  buildingGridSchema,
  buildingLayoutResultSchema,
  buildingLayoutSchema,
  bulkResultSchema,
  levelCountsQuery,
  levelCountsSchema,
  locationBulkSchema,
  locationCreateSchema,
  locationSearchQuery,
  locationSearchSchema,
  locationUpdateSchema,
  locationViewSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { LayoutService } from './layout.service.js';
import { LocationSearchService } from './location-search.service.js';
import { LocationsService } from './locations.service.js';

export class LocationViewDto extends createDto(locationViewSchema) {}
export class LocationCreateDto extends createDto(locationCreateSchema) {}
export class LocationUpdateDto extends createDto(locationUpdateSchema) {}
export class LocationBulkDto extends createDto(locationBulkSchema) {}
export class BulkResultDto extends createDto(bulkResultSchema) {}
export class LocationSearchDto extends createDto(locationSearchSchema) {}
export class LocationSearchQueryDto extends createDto(locationSearchQuery) {}
export class LevelCountsDto extends createDto(levelCountsSchema) {}
export class LevelCountsQueryDto extends createDto(levelCountsQuery) {}
export class BuildingGridDto extends createDto(buildingGridSchema) {}
export class BuildingLayoutDto extends createDto(buildingLayoutSchema) {}
export class BuildingLayoutResultDto extends createDto(buildingLayoutResultSchema) {}

/** The property tree above the units. The service checks every row against the caller's area and writes the audit rows. */
@Controller('locations')
@SkipAudit()
export class LocationsController {
  constructor(
    private readonly locations: LocationsService,
    private readonly finder: LocationSearchService,
    private readonly layout: LayoutService,
  ) {}

  /** The top of the tree the caller may see. */
  @Get()
  @Can('locations', 'view')
  @ZodResponse({ status: 200, type: LocationViewDto })
  top(@CurrentActor() actor: Actor) {
    return this.locations.top(actor);
  }

  /** Places at one level and/or matching a name or holding code, inside one place or the caller's tree. */
  @Get('search')
  @Can('locations', 'view')
  @ZodResponse({ status: 200, type: LocationSearchDto })
  search(@CurrentActor() actor: Actor, @Query() query: LocationSearchQueryDto) {
    return this.finder.search(actor, query);
  }

  /** How many places of each level lie below one place (or in the caller's tree). */
  @Get('level-counts')
  @Can('locations', 'view')
  @ZodResponse({ status: 200, type: LevelCountsDto })
  levelCounts(@CurrentActor() actor: Actor, @Query() { under }: LevelCountsQueryDto) {
    return this.finder.levelCounts(actor, under);
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

  /** A building's floors and the units on each, for the grid. */
  @Get(':id/grid')
  @Can('locations', 'view')
  @ZodResponse({ status: 200, type: BuildingGridDto })
  grid(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.layout.grid(actor, id);
  }

  /** "Set up floors and units": a new building's floors and the units on each, all or none. */
  @Post(':id/layout')
  @Can('locations', 'create')
  @ZodResponse({ status: 201, type: BuildingLayoutResultDto })
  setUp(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: BuildingLayoutDto) {
    return this.layout.apply(actor, id, body);
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
