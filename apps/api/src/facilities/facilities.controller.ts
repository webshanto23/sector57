import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { facilityCreateSchema, facilityDetailSchema, facilityFundsSchema, facilityListQuery, facilityListSchema, facilityUpdateSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { FacilitiesService } from './facilities.service.js';

export class FacilityListQueryDto extends createDto(facilityListQuery) {}
export class FacilityListDto extends createDto(facilityListSchema) {}
export class FacilityDetailDto extends createDto(facilityDetailSchema) {}
export class FacilityCreateDto extends createDto(facilityCreateSchema) {}
export class FacilityUpdateDto extends createDto(facilityUpdateSchema) {}
export class FacilityFundsDto extends createDto(facilityFundsSchema) {}

/** Facilities, under the `facilities` permission where each one is. The service writes its own audit rows. */
@Controller('facilities')
@SkipAudit()
export class FacilitiesController {
  constructor(private readonly facilities: FacilitiesService) {}

  @Get()
  @Can('facilities', 'view')
  @ZodResponse({ status: 200, type: FacilityListDto })
  list(@CurrentActor() actor: Actor, @Query() query: FacilityListQueryDto) {
    return this.facilities.list(actor, query);
  }

  /** Funds a facility may take (none while separate facility funds are off). */
  @Get('funds')
  @Can('facilities', 'view')
  @ZodResponse({ status: 200, type: FacilityFundsDto })
  funds(@CurrentActor() actor: Actor) {
    return this.facilities.funds(actor);
  }

  @Get(':id')
  @Can('facilities', 'view')
  @ZodResponse({ status: 200, type: FacilityDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.facilities.get(actor, id);
  }

  /** 409 `facility_name_taken`, `separate_funds_off`, `fund_default`, `fund_closed`. */
  @Post()
  @Can('facilities', 'create')
  @ZodResponse({ status: 201, type: FacilityDetailDto })
  create(@CurrentActor() actor: Actor, @Body() body: FacilityCreateDto) {
    return this.facilities.create(actor, body);
  }

  /** 409 `facility_archived`, `facility_name_taken`, and the fund codes. */
  @Patch(':id')
  @Can('facilities', 'edit')
  @ZodResponse({ status: 200, type: FacilityDetailDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: FacilityUpdateDto) {
    return this.facilities.update(actor, id, body);
  }

  /** 409 `facility_has_assets`, `facility_archived`. */
  @Post(':id/archive')
  @HttpCode(200)
  @Can('facilities', 'edit')
  @ZodResponse({ status: 200, type: FacilityDetailDto })
  archive(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.facilities.archive(actor, id, true);
  }

  /** 409 `facility_not_archived`, `facility_name_taken`. */
  @Post(':id/restore')
  @HttpCode(200)
  @Can('facilities', 'edit')
  @ZodResponse({ status: 200, type: FacilityDetailDto })
  restore(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.facilities.archive(actor, id, false);
  }
}
