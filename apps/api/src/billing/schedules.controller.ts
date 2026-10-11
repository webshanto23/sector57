import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  billAheadInputSchema,
  billAheadPreviewSchema,
  billAheadResultSchema,
  billingRunInputSchema,
  billingRunListQuery,
  billingRunListSchema,
  billingRunPreviewSchema,
  billingRunSchema,
  scheduleInputSchema,
  scheduleListSchema,
  scheduleSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { BillingRunsService } from './billing-runs.service.js';
import { SchedulesService } from './schedules.service.js';

export class ScheduleDto extends createDto(scheduleSchema) {}
export class ScheduleListDto extends createDto(scheduleListSchema) {}
export class ScheduleInputDto extends createDto(scheduleInputSchema) {}
export class BillingRunDto extends createDto(billingRunSchema) {}
export class BillingRunListDto extends createDto(billingRunListSchema) {}
export class BillingRunListQueryDto extends createDto(billingRunListQuery) {}
export class BillingRunPreviewDto extends createDto(billingRunPreviewSchema) {}
export class BillingRunInputDto extends createDto(billingRunInputSchema) {}
export class BillAheadInputDto extends createDto(billAheadInputSchema) {}
export class BillAheadPreviewDto extends createDto(billAheadPreviewSchema) {}
export class BillAheadResultDto extends createDto(billAheadResultSchema) {}

/**
 * Recurring charges. Anyone who may view bills may read them; changes need a society-wide
 * billing role. No deletes: a schedule is ended. The service audits every write.
 */
@Controller('schedules')
@SkipAudit()
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  @Can('billing', 'view')
  @ZodResponse({ status: 200, type: ScheduleListDto })
  list(@CurrentActor() actor: Actor) {
    return this.schedules.list(actor);
  }

  @Post()
  @Can('billing', 'create')
  @ZodResponse({ status: 201, type: ScheduleDto })
  create(@CurrentActor() actor: Actor, @Body() body: ScheduleInputDto) {
    return this.schedules.create(actor, body);
  }

  /** Once it has made bills, its charge type, frequency and start can't change (409 `schedule_in_use`). */
  @Put(':id')
  @Can('billing', 'edit')
  @ZodResponse({ status: 200, type: ScheduleDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: ScheduleInputDto) {
    return this.schedules.update(actor, id, body);
  }

  @Post(':id/pause')
  @HttpCode(200)
  @Can('billing', 'edit')
  @ZodResponse({ status: 200, type: ScheduleDto })
  pause(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.schedules.setStatus(actor, id, 'pause');
  }

  /** The paused months are not billed. */
  @Post(':id/resume')
  @HttpCode(200)
  @Can('billing', 'edit')
  @ZodResponse({ status: 200, type: ScheduleDto })
  resume(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.schedules.setStatus(actor, id, 'resume');
  }

  @Post(':id/end')
  @HttpCode(200)
  @Can('billing', 'edit')
  @ZodResponse({ status: 200, type: ScheduleDto })
  end(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.schedules.setStatus(actor, id, 'end');
  }
}

/** Billing runs: preview, confirm, history. Society-wide billing roles only. */
@Controller('billing-runs')
@SkipAudit()
export class BillingRunsController {
  constructor(private readonly runs: BillingRunsService) {}

  @Get()
  @Can('billing', 'view')
  @ZodResponse({ status: 200, type: BillingRunListDto })
  list(@CurrentActor() actor: Actor, @Query() query: BillingRunListQueryDto) {
    return this.runs.list(actor, query);
  }

  /** What a run for `month` would bill now. Writes nothing. */
  @Get('preview')
  @Can('billing', 'create')
  @ZodResponse({ status: 200, type: BillingRunPreviewDto })
  preview(@CurrentActor() actor: Actor, @Query() query: BillingRunInputDto) {
    return this.runs.preview(actor, query.month);
  }

  /** Bills everything due up to `month` (this month or earlier), all or nothing. */
  @Post()
  @Can('billing', 'create')
  @ZodResponse({ status: 201, type: BillingRunDto })
  run(@CurrentActor() actor: Actor, @Body() body: BillingRunInputDto) {
    return this.runs.runManual(actor, body.month);
  }
}

/** Billing one unit ahead from its schedules, for someone paying months in advance. `billing.create` on the unit. */
@Controller('units')
@SkipAudit()
export class BillAheadController {
  constructor(private readonly runs: BillingRunsService) {}

  /** What billing the unit up to `month` would make. Writes nothing. */
  @Get(':id/bill-ahead')
  @Can('billing', 'create')
  @ZodResponse({ status: 200, type: BillAheadPreviewDto })
  preview(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Query() query: BillAheadInputDto) {
    return this.runs.billAheadPreview(actor, id, query.month);
  }

  /** 400 `nothing_to_bill` when every month up to `month` is billed already. */
  @Post(':id/bill-ahead')
  @Can('billing', 'create')
  @ZodResponse({ status: 201, type: BillAheadResultDto })
  billAhead(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: BillAheadInputDto) {
    return this.runs.billAhead(actor, id, body.month);
  }
}
