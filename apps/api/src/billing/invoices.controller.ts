import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  billingLookupQuery,
  billingLookupSchema,
  invoiceCreateSchema,
  invoiceDetailSchema,
  invoiceListQuery,
  invoiceListSchema,
  invoiceVoidSchema,
  openingArrearsSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { InvoicesService } from './invoices.service.js';

export class InvoiceListDto extends createDto(invoiceListSchema) {}
export class InvoiceListQueryDto extends createDto(invoiceListQuery) {}
export class InvoiceDetailDto extends createDto(invoiceDetailSchema) {}
export class InvoiceCreateDto extends createDto(invoiceCreateSchema) {}
export class OpeningArrearsDto extends createDto(openingArrearsSchema) {}
export class InvoiceVoidDto extends createDto(invoiceVoidSchema) {}
export class BillingLookupDto extends createDto(billingLookupSchema) {}
export class BillingLookupQueryDto extends createDto(billingLookupQuery) {}

/**
 * Bills. The service checks each one against the caller's area (through its unit) and
 * writes its own audit rows. No deletes: a wrong bill is voided.
 */
@Controller('invoices')
@SkipAudit()
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  /** Paged, newest first, with the four figures for the stat cards. A unit's or a payer's bills with `unitId`, `personId`, `organisationId`. */
  @Get()
  @Can('billing', 'view')
  @ZodResponse({ status: 200, type: InvoiceListDto })
  list(@CurrentActor() actor: Actor, @Query() query: InvoiceListQueryDto) {
    return this.invoices.list(actor, query);
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
  constructor(private readonly invoices: InvoicesService) {}

  @Get('lookup')
  @Can('billing', 'create')
  @ZodResponse({ status: 200, type: BillingLookupDto })
  lookup(@CurrentActor() actor: Actor, @Query() query: BillingLookupQueryDto) {
    return this.invoices.lookup(actor, query);
  }
}
