import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ticketStaffListSchema,
  ticketStaffQuery,
  workOrderCancelSchema,
  workOrderCreateSchema,
  workOrderDetailSchema,
  workOrderDoneSchema,
  workOrderListQuery,
  workOrderListSchema,
  workOrderOptionsSchema,
  workOrderUpdateSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { HelpdeskService } from '../helpdesk/helpdesk.service.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { WorkOrderActionsService } from './work-order-actions.service.js';
import { WorkOrdersService } from './work-orders.service.js';

export class WorkOrderListQueryDto extends createDto(workOrderListQuery) {}
export class WorkOrderListDto extends createDto(workOrderListSchema) {}
export class WorkOrderDetailDto extends createDto(workOrderDetailSchema) {}
export class WorkOrderCreateDto extends createDto(workOrderCreateSchema) {}
export class WorkOrderUpdateDto extends createDto(workOrderUpdateSchema) {}
export class WorkOrderDoneDto extends createDto(workOrderDoneSchema) {}
export class WorkOrderCancelDto extends createDto(workOrderCancelSchema) {}
export class WorkOrderOptionsDto extends createDto(workOrderOptionsSchema) {}
export class WorkOrderStaffQueryDto extends createDto(ticketStaffQuery) {}
export class WorkOrderStaffListDto extends createDto(ticketStaffListSchema) {}

/** Work orders (কাজের আদেশ), under the `work_orders` permission where the work is. The services write their own audit rows. */
@Controller('work-orders')
@SkipAudit()
export class WorkOrdersController {
  constructor(
    private readonly orders: WorkOrdersService,
    private readonly actions: WorkOrderActionsService,
    private readonly helpdesk: HelpdeskService,
  ) {}

  @Get()
  @Can('work_orders', 'view')
  @ZodResponse({ status: 200, type: WorkOrderListDto })
  list(@CurrentActor() actor: Actor, @Query() query: WorkOrderListQueryDto) {
    return this.orders.list(actor, query);
  }

  /** Vendors a job may go to. */
  @Get('options')
  @Can('work_orders', 'view')
  @ZodResponse({ status: 200, type: WorkOrderOptionsDto })
  options(@CurrentActor() actor: Actor) {
    return this.orders.options(actor);
  }

  /** Current staff a work order may be given to (posted inside the caller's area or above it). */
  @Get('staff')
  @Can('work_orders', 'view')
  @ZodResponse({ status: 200, type: WorkOrderStaffListDto })
  staff(@CurrentActor() actor: Actor, @Query() query: WorkOrderStaffQueryDto) {
    return this.helpdesk.staff(actor, query, 'work_orders');
  }

  @Get(':id')
  @Can('work_orders', 'view')
  @ZodResponse({ status: 200, type: WorkOrderDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.orders.get(actor, id);
  }

  /** 404 for a source or place out of sight; 409 `ticket_finished`, `asset_gone`; 400 `plan_asset_mismatch`. */
  @Post()
  @Can('work_orders', 'create')
  @ZodResponse({ status: 201, type: WorkOrderDetailDto })
  create(@CurrentActor() actor: Actor, @Body() body: WorkOrderCreateDto) {
    return this.orders.create(actor, body);
  }

  /** 409 `work_order_finished`. */
  @Patch(':id')
  @Can('work_orders', 'edit')
  @ZodResponse({ status: 200, type: WorkOrderDetailDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: WorkOrderUpdateDto) {
    return this.orders.update(actor, id, body);
  }

  /** 409 `work_order_status_invalid`, `work_order_status_changed`. */
  @Post(':id/start')
  @HttpCode(200)
  @Can('work_orders', 'edit')
  @ZodResponse({ status: 200, type: WorkOrderDetailDto })
  start(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.actions.start(actor, id);
  }

  /** A cost needs `expenses.create` too. 400 `future_date` and the expense codes; 409 as for start. */
  @Post(':id/done')
  @HttpCode(200)
  @Can('work_orders', 'edit')
  @ZodResponse({ status: 200, type: WorkOrderDetailDto })
  done(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: WorkOrderDoneDto) {
    return this.actions.done(actor, id, body);
  }

  /** Needs `work_orders.approve` where the work is. 409 as for start. */
  @Post(':id/cancel')
  @HttpCode(200)
  @Can('work_orders', 'view')
  @ZodResponse({ status: 200, type: WorkOrderDetailDto })
  cancel(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: WorkOrderCancelDto) {
    return this.actions.cancel(actor, id, body);
  }
}
