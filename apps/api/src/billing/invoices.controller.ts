import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  billableUnitsSchema,
  billingLookupQuery,
  billingLookupSchema,
  invoiceBatchCheckSchema,
  invoiceBatchResultSchema,
  invoiceBatchSchema,
  invoiceCreateSchema,
  invoiceDetailSchema,
  invoiceListQuery,
  invoiceListSchema,
  invoicePrintQuery,
  invoicePrintSchema,
  invoiceVoidSchema,
  openingArrearsSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { InvoiceBatchService } from './invoice-batch.service.js';
import { InvoicesService } from './invoices.service.js';

export class InvoiceListDto extends createDto(invoiceListSchema) {}
export class InvoiceBatchDto extends createDto(invoiceBatchSchema) {}
export class InvoiceBatchCheckDto extends createDto(invoiceBatchCheckSchema) {}
export class InvoiceBatchResultDto extends createDto(invoiceBatchResultSchema) {}
export class InvoicePrintDto extends createDto(invoicePrintSchema) {}
export class InvoicePrintQueryDto extends createDto(invoicePrintQuery) {}
export class InvoiceListQueryDto extends createDto(invoiceListQuery) {}
export class InvoiceDetailDto extends createDto(invoiceDetailSchema) {}
export class InvoiceCreateDto extends createDto(invoiceCreateSchema) {}
export class OpeningArrearsDto extends createDto(openingArrearsSchema) {}
export class InvoiceVoidDto extends createDto(invoiceVoidSchema) {}
export class BillingLookupDto extends createDto(billingLookupSchema) {}
export class BillingLookupQueryDto extends createDto(billingLookupQuery) {}
export class BillableUnitsDto extends createDto(billableUnitsSchema) {}

/**
 * Bills. The service checks each one against the caller's area (through its unit) and
 * writes its own audit rows. No deletes: a wrong bill is voided.
 */
@Controller('invoices')
@SkipAudit()
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly batch: InvoiceBatchService,
  ) {}

  /** Paged, newest first, with the four figures for the stat cards. A unit's or a payer's bills with `unitId`, `personId`, `organisationId`. */
  @Get()
  @Can('billing', 'view')
  @ZodResponse({ status: 200, type: InvoiceListDto })
  list(@CurrentActor() actor: Actor, @Query() query: InvoiceListQueryDto) {
    return this.invoices.list(actor, query);
  }

  /** Several bills to print together, in the order asked (at most 50). 404 if any is missing or outside the caller's area. */
  @Get('print')
  @Can('billing', 'view')
  @ZodResponse({ status: 200, type: InvoicePrintDto })
  print(@CurrentActor() actor: Actor, @Query() { ids }: InvoicePrintQueryDto) {
    return this.batch.print(actor, ids);
  }

  @Get(':id')
  @Can('billing', 'view')
  @ZodResponse({ status: 200, type: InvoiceDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.invoices.get(actor, id);
  }

  /** A bill for a unit, or a membership fee for a person. 400 `no_bill_to` when nobody owns or rents the unit. */
  @Post()
  @Can('billing', 'create')
  @ZodResponse({ status: 201, type: InvoiceDetailDto })
  create(@CurrentActor() actor: Actor, @Body() body: InvoiceCreateDto) {
    return this.invoices.create(actor, body);
  }

  /** What a batch would make: per unit who pays, one bill per fund, and earlier bills with the same charge in the same months. Writes nothing. */
  @Post('batch/check')
  @HttpCode(200)
  @Can('billing', 'create')
  @ZodResponse({ status: 200, type: InvoiceBatchCheckDto })
  checkBatch(@CurrentActor() actor: Actor, @Body() body: InvoiceBatchDto) {
    return this.batch.check(actor, body);
  }

  /** Bills for several units at once, all or none. An error names its unit in `details.unitId`. */
  @Post('batch')
  @Can('billing', 'create')
  @ZodResponse({ status: 201, type: InvoiceBatchResultDto })
  createBatch(@CurrentActor() actor: Actor, @Body() body: InvoiceBatchDto) {
    return this.batch.create(actor, body);
  }

  /** A unit's earlier arrears, once per unit (409 `opening_exists`; void the old one to type it again). */
  @Post('opening')
  @Can('billing', 'create')
  @ZodResponse({ status: 201, type: InvoiceDetailDto })
  createOpening(@CurrentActor() actor: Actor, @Body() body: OpeningArrearsDto) {
    return this.invoices.createOpening(actor, body);
  }

  /** Only while nothing is paid on it (409 `invoice_has_payments`). */
  @Post(':id/void')
  @HttpCode(200)
  @Can('billing', 'approve')
  @ZodResponse({ status: 200, type: InvoiceDetailDto })
  void(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: InvoiceVoidDto) {
    return this.invoices.void(actor, id, body);
  }
}

/** Finding a unit or member to bill, with who the bill would go to. */
@Controller('billing')
export class BillingLookupController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly batch: InvoiceBatchService,
  ) {}

  @Get('lookup')
  @Can('billing', 'create')
  @ZodResponse({ status: 200, type: BillingLookupDto })
  lookup(@CurrentActor() actor: Actor, @Query() query: BillingLookupQueryDto) {
    return this.invoices.lookup(actor, query);
  }

  /** Every unit the caller may bill (at most 2000), with who a bill would go to: the batch's unit picker. */
  @Get('units')
  @Can('billing', 'create')
  @ZodResponse({ status: 200, type: BillableUnitsDto })
  units(@CurrentActor() actor: Actor) {
    return this.batch.billable(actor);
  }
}
