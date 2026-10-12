import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  donationCreateSchema,
  donationDetailSchema,
  donationListQuery,
  donationListSchema,
  donationOptionsSchema,
  donorLookupQuery,
  donorLookupSchema,
  paymentPrintSchema,
  paymentVoidSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { DonationsService } from './donations.service.js';

export class DonationCreateDto extends createDto(donationCreateSchema) {}
export class DonationDetailDto extends createDto(donationDetailSchema) {}
export class DonationListDto extends createDto(donationListSchema) {}
export class DonationListQueryDto extends createDto(donationListQuery) {}
export class DonationOptionsDto extends createDto(donationOptionsSchema) {}
export class DonorLookupDto extends createDto(donorLookupSchema) {}
export class DonorLookupQueryDto extends createDto(donorLookupQuery) {}
export class DonationPrintDto extends createDto(paymentPrintSchema) {}
export class DonationVoidDto extends createDto(paymentVoidSchema) {}

/**
 * Donations, each with its own receipt. Society-wide (`donations` has no area scope). The
 * service writes its own audit rows. No deletes: a wrong donation is voided.
 */
@Controller('donations')
@SkipAudit()
export class DonationsController {
  constructor(private readonly donations: DonationsService) {}

  /** Funds, earlier purposes and the receipt header, for the form. */
  @Get('options')
  @Can('donations', 'create')
  @ZodResponse({ status: 200, type: DonationOptionsDto })
  options(@CurrentActor() actor: Actor) {
    return this.donations.options(actor.societyId);
  }

  /** People and organisations on record, by name or phone. */
  @Get('donors')
  @Can('donations', 'create')
  @ZodResponse({ status: 200, type: DonorLookupDto })
  donors(@CurrentActor() actor: Actor, @Query() query: DonorLookupQueryDto) {
    return this.donations.donors(actor, query);
  }

  @Get()
  @Can('donations', 'view')
  @ZodResponse({ status: 200, type: DonationListDto })
  list(@CurrentActor() actor: Actor, @Query() query: DonationListQueryDto) {
    return this.donations.list(actor, query);
  }

  @Get(':id')
  @Can('donations', 'view')
  @ZodResponse({ status: 200, type: DonationDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.donations.get(actor, id);
  }

  /** Records the donation, its receipt and its ledger row. 400 `invalid_fund`, `donor_not_found`; 409 `fund_closed`. */
  @Post()
  @Can('donations', 'create')
  @ZodResponse({ status: 201, type: DonationDetailDto })
  create(@CurrentActor() actor: Actor, @Body() body: DonationCreateDto) {
    return this.donations.create(actor, body);
  }

  /** Call before printing the receipt: the first print is the original, every later one a duplicate. */
  @Post(':id/print')
  @HttpCode(200)
  @Can('donations', 'view')
  @ZodResponse({ status: 200, type: DonationPrintDto })
  print(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.donations.print(actor, id);
  }

  /** The collector on the day before handover, otherwise `donations.approve` (403 `void_needs_approval`). */
  @Post(':id/void')
  @HttpCode(200)
  @Can('donations', 'view')
  @ZodResponse({ status: 200, type: DonationDetailDto })
  void(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: DonationVoidDto) {
    return this.donations.void(actor, id, body);
  }
}
