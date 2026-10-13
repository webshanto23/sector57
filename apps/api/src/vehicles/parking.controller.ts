import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { parkingAssignSchema, parkingListQuery, parkingListSchema, parkingSlotCreateSchema, parkingSlotSchema, parkingSlotUpdateSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { ParkingService } from './parking.service.js';

export class ParkingListQueryDto extends createDto(parkingListQuery) {}
export class ParkingListDto extends createDto(parkingListSchema) {}
export class ParkingSlotDto extends createDto(parkingSlotSchema) {}
export class ParkingSlotCreateDto extends createDto(parkingSlotCreateSchema) {}
export class ParkingSlotUpdateDto extends createDto(parkingSlotUpdateSchema) {}
export class ParkingAssignDto extends createDto(parkingAssignSchema) {}

/** Parking slots, under the `vehicles` permission where the slot is. The service writes its own audit rows. */
@Controller('parking')
@SkipAudit()
export class ParkingController {
  constructor(private readonly parking: ParkingService) {}

  @Get()
  @Can('vehicles', 'view')
  @ZodResponse({ status: 200, type: ParkingListDto })
  list(@CurrentActor() actor: Actor, @Query() query: ParkingListQueryDto) {
    return this.parking.list(actor, query);
  }

  @Get(':id')
  @Can('vehicles', 'view')
  @ZodResponse({ status: 200, type: ParkingSlotDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.parking.get(actor, id);
  }

  /** 404 `location_not_found`; 409 `parking_code_taken`. */
  @Post()
  @Can('vehicles', 'create')
  @ZodResponse({ status: 201, type: ParkingSlotDto })
  create(@CurrentActor() actor: Actor, @Body() body: ParkingSlotCreateDto) {
    return this.parking.create(actor, body);
  }

  /** 409 `parking_slot_removed`, `parking_code_taken`. */
  @Patch(':id')
  @Can('vehicles', 'edit')
  @ZodResponse({ status: 200, type: ParkingSlotDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: ParkingSlotUpdateDto) {
    return this.parking.update(actor, id, body);
  }

  /** 404 `unit_not_found`, `vehicle_not_found`; 409 `vehicle_removed`, `parking_vehicle_taken`, `parking_slot_removed`. */
  @Post(':id/assign')
  @HttpCode(200)
  @Can('vehicles', 'edit')
  @ZodResponse({ status: 200, type: ParkingSlotDto })
  assign(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: ParkingAssignDto) {
    return this.parking.assign(actor, id, body);
  }

  /** 409 `parking_slot_removed`. */
  @Post(':id/remove')
  @HttpCode(200)
  @Can('vehicles', 'delete')
  @ZodResponse({ status: 200, type: ParkingSlotDto })
  remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.parking.remove(actor, id);
  }
}
