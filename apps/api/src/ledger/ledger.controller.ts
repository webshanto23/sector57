import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ledgerQuery,
  ledgerStatementSchema,
  transferInputSchema,
  transferListQuery,
  transferListSchema,
  transferSchema,
  transferVoidSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { LedgerService } from './ledger.service.js';
import { TransfersService } from './transfers.service.js';

export class LedgerQueryDto extends createDto(ledgerQuery) {}
export class LedgerStatementDto extends createDto(ledgerStatementSchema) {}
export class TransferDto extends createDto(transferSchema) {}
export class TransferInputDto extends createDto(transferInputSchema) {}
export class TransferListDto extends createDto(transferListSchema) {}
export class TransferListQueryDto extends createDto(transferListQuery) {}
export class TransferVoidDto extends createDto(transferVoidSchema) {}

/** The fund ledger and transfers (`ledger`, society-wide). No deletes: a transfer is voided. The services audit every write. */
@Controller('ledger')
@SkipAudit()
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly transfers: TransfersService,
  ) {}

  /** A statement: opening balance, rows with the running balance, closing. 400 `invalid_range`, 404 `fund_not_found`. */
  @Get()
  @Can('ledger', 'view')
  @ZodResponse({ status: 200, type: LedgerStatementDto })
  statement(@CurrentActor() actor: Actor, @Query() query: LedgerQueryDto) {
    return this.ledger.statement(actor.societyId, query);
  }

  @Get('transfers')
  @Can('ledger', 'view')
  @ZodResponse({ status: 200, type: TransferListDto })
  list(@CurrentActor() actor: Actor, @Query() query: TransferListQueryDto) {
    return this.transfers.list(actor, query);
  }

  @Get('transfers/:id')
  @Can('ledger', 'view')
  @ZodResponse({ status: 200, type: TransferDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.transfers.get(actor, id);
  }

  /** 400 `invalid_fund`; 409 `fund_closed`, `fund_insufficient` (the source's balance in `details.balance`). */
  @Post('transfers')
  @Can('ledger', 'create')
  @ZodResponse({ status: 201, type: TransferDto })
  create(@CurrentActor() actor: Actor, @Body() body: TransferInputDto) {
    return this.transfers.create(actor, body);
  }

  /** 409 `transfer_already_void`, `fund_insufficient` (the destination no longer holds it). */
  @Post('transfers/:id/void')
  @HttpCode(200)
  @Can('ledger', 'approve')
  @ZodResponse({ status: 200, type: TransferDto })
  void(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: TransferVoidDto) {
    return this.transfers.void(actor, id, body);
  }
}
