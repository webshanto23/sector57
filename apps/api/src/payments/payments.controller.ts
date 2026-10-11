import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  collectLookupQuery,
  collectLookupSchema,
  collectSummarySchema,
  handoverConfirmSchema,
  handoverListQuery,
  handoverListSchema,
  handoverSchema,
  paymentCreateSchema,
  paymentDetailSchema,
  paymentListQuery,
  paymentListSchema,
  paymentPrintSchema,
  paymentVoidSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { HandoversService } from './handovers.service.js';
import { PaymentsService } from './payments.service.js';

export class CollectLookupDto extends createDto(collectLookupSchema) {}
export class CollectLookupQueryDto extends createDto(collectLookupQuery) {}
export class CollectSummaryDto extends createDto(collectSummarySchema) {}
export class PaymentCreateDto extends createDto(paymentCreateSchema) {}
export class PaymentDetailDto extends createDto(paymentDetailSchema) {}
export class PaymentListDto extends createDto(paymentListSchema) {}
export class PaymentListQueryDto extends createDto(paymentListQuery) {}
export class PaymentPrintDto extends createDto(paymentPrintSchema) {}
export class PaymentVoidDto extends createDto(paymentVoidSchema) {}
export class HandoverDto extends createDto(handoverSchema) {}
export class HandoverListDto extends createDto(handoverListSchema) {}
export class HandoverListQueryDto extends createDto(handoverListQuery) {}
export class HandoverConfirmDto extends createDto(handoverConfirmSchema) {}

/** The collect page: finding open bills and the caller's figures. */
@Controller('collect')
export class CollectController {
  constructor(private readonly payments: PaymentsService) {}

  /** Units in the caller's collect area (and members, society-wide) with their open bills, oldest first. */
  @Get('lookup')
  @Can('payments', 'create')
  @ZodResponse({ status: 200, type: CollectLookupDto })
  lookup(@CurrentActor() actor: Actor, @Query() query: CollectLookupQueryDto) {
    return this.payments.lookup(actor, query);
  }

  /** Receipts today, cash in hand and pending handovers, for the caller. */
  @Get('summary')
  @Can('payments', 'create')
  @ZodResponse({ status: 200, type: CollectSummaryDto })
  summary(@CurrentActor() actor: Actor) {
    return this.payments.summary(actor);
  }
}

/**
 * Receipts. The service checks each one against the caller's area (through its unit) and
 * writes its own audit rows. No deletes: a wrong receipt is voided.
 */
@Controller('payments')
@SkipAudit()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @Can('payments', 'view')
  @ZodResponse({ status: 200, type: PaymentListDto })
  list(@CurrentActor() actor: Actor, @Query() query: PaymentListQueryDto) {
    return this.payments.list(actor, query);
  }

  @Get(':id')
  @Can('payments', 'view')
  @ZodResponse({ status: 200, type: PaymentDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.payments.get(actor, id);
  }

  /** Cash for ticked open bills. 409 `invoice_changed` when one was paid or voided meanwhile. */
  @Post()
  @Can('payments', 'create')
  @ZodResponse({ status: 201, type: PaymentDetailDto })
  create(@CurrentActor() actor: Actor, @Body() body: PaymentCreateDto) {
    return this.payments.create(actor, body);
  }

  /** Call before printing: the first print is the original, every later one a duplicate. */
  @Post(':id/print')
  @HttpCode(200)
  @Can('payments', 'view')
  @ZodResponse({ status: 200, type: PaymentPrintDto })
  print(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.payments.print(actor, id);
  }

  /** The collector on the day before handover, otherwise `payments.approve` (403 `void_needs_approval`). */
  @Post(':id/void')
  @HttpCode(200)
  @Can('payments', 'view')
  @ZodResponse({ status: 200, type: PaymentDetailDto })
  void(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: PaymentVoidDto) {
    return this.payments.void(actor, id, body);
  }
}

/** Closing the day: the collector hands over, someone else confirms the count. */
@Controller('handovers')
@SkipAudit()
export class HandoversController {
  constructor(private readonly handovers: HandoversService) {}

  /** The caller's own handovers, and those an approver may confirm; pending first. */
  @Get()
  @Can('payments', 'view')
  @ZodResponse({ status: 200, type: HandoverListDto })
  list(@CurrentActor() actor: Actor, @Query() query: HandoverListQueryDto) {
    return this.handovers.list(actor, query);
  }

  @Get(':id')
  @Can('payments', 'view')
  @ZodResponse({ status: 200, type: HandoverDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.handovers.get(actor, id);
  }

  /** All the caller's cash in hand. 400 `nothing_to_hand_over`. */
  @Post()
  @Can('payments', 'create')
  @ZodResponse({ status: 201, type: HandoverDto })
  create(@CurrentActor() actor: Actor) {
    return this.handovers.create(actor);
  }

  /** 403 `cannot_confirm_own`; 400 `note_required` when the count differs. */
  @Post(':id/confirm')
  @HttpCode(200)
  @Can('payments', 'approve')
  @ZodResponse({ status: 200, type: HandoverDto })
  confirm(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: HandoverConfirmDto) {
    return this.handovers.confirm(actor, id, body);
  }
}
