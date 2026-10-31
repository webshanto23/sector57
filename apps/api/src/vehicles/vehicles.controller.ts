import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  stickerSettingsSchema,
  stickerSettingsViewSchema,
  vehicleCreateSchema,
  vehicleDetailSchema,
  vehicleListQuery,
  vehicleListSchema,
  vehicleLookupQuery,
  vehicleLookupSchema,
  vehicleRemoveSchema,
  vehicleUnitPeopleQuery,
  vehicleUnitHoldersSchema,
  vehicleUpdateSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { StickersService } from './stickers.service.js';
import { VehiclesService } from './vehicles.service.js';

export class VehicleListQueryDto extends createDto(vehicleListQuery) {}
export class VehicleListDto extends createDto(vehicleListSchema) {}
export class VehicleDetailDto extends createDto(vehicleDetailSchema) {}
export class VehicleCreateDto extends createDto(vehicleCreateSchema) {}
export class VehicleUpdateDto extends createDto(vehicleUpdateSchema) {}
export class VehicleRemoveDto extends createDto(vehicleRemoveSchema) {}
export class VehicleLookupQueryDto extends createDto(vehicleLookupQuery) {}
export class VehicleLookupDto extends createDto(vehicleLookupSchema) {}
export class VehicleUnitPeopleQueryDto extends createDto(vehicleUnitPeopleQuery) {}
export class VehicleUnitPeopleDto extends createDto(vehicleUnitHoldersSchema) {}
export class StickerSettingsDto extends createDto(stickerSettingsSchema) {}
export class StickerSettingsViewDto extends createDto(stickerSettingsViewSchema) {}

/** Vehicles (যানবাহন), under the `vehicles` permission where their unit is. The service writes its own audit rows. */
@Controller('vehicles')
@SkipAudit()
export class VehiclesController {
  constructor(
    private readonly vehicles: VehiclesService,
    private readonly stickers: StickersService,
  ) {}

  @Get()
  @Can('vehicles', 'view')
  @ZodResponse({ status: 200, type: VehicleListDto })
  list(@CurrentActor() actor: Actor, @Query() query: VehicleListQueryDto) {
    return this.vehicles.list(actor, query);
  }

  /** A guard's check by plate: the unit and the sticker only. Not gate management: nothing is logged. */
  @Get('lookup')
  @Can('vehicles', 'view')
  @ZodResponse({ status: 200, type: VehicleLookupDto })
  lookup(@CurrentActor() actor: Actor, @Query() { plate }: VehicleLookupQueryDto) {
    return this.vehicles.lookup(actor, plate);
  }

  /** Who a vehicle at the unit may belong to. 404 `unit_not_found`. */
  @Get('unit-people')
  @Can('vehicles', 'view')
  @ZodResponse({ status: 200, type: VehicleUnitPeopleDto })
  unitPeople(@CurrentActor() actor: Actor, @Query() { unitId }: VehicleUnitPeopleQueryDto) {
    return this.vehicles.unitPeople(actor, unitId);
  }

  /** The sticker prefix, validity (calendar or fiscal year) and fee. */
  @Get('settings')
  @Can('vehicles', 'view')
  @ZodResponse({ status: 200, type: StickerSettingsViewDto })
  settings(@CurrentActor() actor: Actor) {
    return this.stickers.settingsView(actor);
  }

  /** A society setting (`settings.edit`). 400 `invalid_charge_type`, `charge_type_archived`. */
  @Put('settings')
  @Can('settings', 'edit')
  @ZodResponse({ status: 200, type: StickerSettingsViewDto })
  setSettings(@CurrentActor() actor: Actor, @Body() body: StickerSettingsDto) {
    return this.stickers.setSettings(actor, body);
  }

  @Get(':id')
  @Can('vehicles', 'view')
  @ZodResponse({ status: 200, type: VehicleDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.vehicles.get(actor, id);
  }

  /** 404 `unit_not_found`, `person_not_found`, `organisation_not_found`; 409 `vehicle_person_not_at_unit`, `vehicle_exists`. */
  @Post()
  @Can('vehicles', 'create')
  @ZodResponse({ status: 201, type: VehicleDetailDto })
  create(@CurrentActor() actor: Actor, @Body() body: VehicleCreateDto) {
    return this.vehicles.create(actor, body);
  }

  /** 409 `vehicle_removed`, `vehicle_person_not_at_unit`, `vehicle_exists`. */
  @Patch(':id')
  @Can('vehicles', 'edit')
  @ZodResponse({ status: 200, type: VehicleDetailDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: VehicleUpdateDto) {
    return this.vehicles.update(actor, id, body);
  }

  /** Revokes its sticker and frees its parking slot. 409 `vehicle_removed`. */
  @Post(':id/remove')
  @HttpCode(200)
  @Can('vehicles', 'delete')
  @ZodResponse({ status: 200, type: VehicleDetailDto })
  remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: VehicleRemoveDto) {
    return this.vehicles.remove(actor, id, body);
  }
}
