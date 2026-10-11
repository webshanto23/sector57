import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { fundInputSchema, fundListSchema, fundSchema, openingInputSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { FundsService } from './funds.service.js';

export class FundDto extends createDto(fundSchema) {}
export class FundListDto extends createDto(fundListSchema) {}
export class FundInputDto extends createDto(fundInputSchema) {}
export class OpeningInputDto extends createDto(openingInputSchema) {}

/** Funds and their balances (`ledger`, society-wide). No deletes: a fund is closed. The service audits every write. */
@Controller('funds')
@SkipAudit()
export class FundsController {
  constructor(private readonly funds: FundsService) {}

  @Get()
  @Can('ledger', 'view')
  @ZodResponse({ status: 200, type: FundListDto })
  list(@CurrentSociety() society: SocietyContext) {
    return this.funds.list(society.id);
  }

  @Post()
  @Can('ledger', 'create')
  @ZodResponse({ status: 201, type: FundDto })
  create(@CurrentActor() actor: Actor, @Body() body: FundInputDto) {
    return this.funds.create(actor, body);
  }

  @Put(':id')
  @Can('ledger', 'edit')
  @ZodResponse({ status: 200, type: FundDto })
  rename(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: FundInputDto) {
    return this.funds.rename(actor, id, body);
  }

  @Post(':id/close')
  @HttpCode(200)
  @Can('ledger', 'edit')
  @ZodResponse({ status: 200, type: FundDto })
  close(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.funds.close(actor, id);
  }

  /** The balance the fund started with; can be corrected until the fund has other entries. */
  @Put(':id/opening')
  @Can('ledger', 'create')
  @ZodResponse({ status: 200, type: FundDto })
  setOpening(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: OpeningInputDto) {
    return this.funds.setOpening(actor, id, body);
  }
}
