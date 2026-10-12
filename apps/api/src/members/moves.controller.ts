import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { moveCompleteSchema, moveCreateSchema, moveDetailSchema, moveListQuery, moveListSchema, moveUpdateSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { MovesService } from './moves.service.js';

export class MoveListQueryDto extends createDto(moveListQuery) {}
export class MoveListDto extends createDto(moveListSchema) {}
export class MoveDetailDto extends createDto(moveDetailSchema) {}
export class MoveCreateDto extends createDto(moveCreateSchema) {}
export class MoveUpdateDto extends createDto(moveUpdateSchema) {}
export class MoveCompleteDto extends createDto(moveCompleteSchema) {}

/** Move-in and move-out checklists, under the `tenancies` permission at the unit. The service writes its own audit rows. */
@Controller('moves')
@SkipAudit()
export class MovesController {
  constructor(private readonly moves: MovesService) {}

  @Get()
  @Can('tenancies', 'view')
  @ZodResponse({ status: 200, type: MoveListDto })
  list(@CurrentActor() actor: Actor, @Query() query: MoveListQueryDto) {
    return this.moves.list(actor, query);
  }

  @Get(':id')
  @Can('tenancies', 'view')
  @ZodResponse({ status: 200, type: MoveDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.moves.get(actor, id);
  }

  /** 409 `move_wrong_status` (move-in needs a pending tenancy, move-out an active one), `move_open_exists`. */
  @Post()
  @Can('tenancies', 'edit')
  @ZodResponse({ status: 201, type: MoveDetailDto })
  create(@CurrentActor() actor: Actor, @Body() body: MoveCreateDto) {
    return this.moves.create(actor, body);
  }

  /** 400 `invalid_check`; 409 `move_closed`. */
  @Patch(':id')
  @Can('tenancies', 'edit')
  @ZodResponse({ status: 200, type: MoveDetailDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: MoveUpdateDto) {
    return this.moves.update(actor, id, body);
  }

  /** 409 `dues_outstanding` (with `details.owed`) without `tenancies.approve`, `move_closed`; 400 `end_before_start`. */
  @Post(':id/complete')
  @HttpCode(200)
  @Can('tenancies', 'edit')
  @ZodResponse({ status: 200, type: MoveDetailDto })
  complete(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: MoveCompleteDto) {
    return this.moves.complete(actor, id, body);
  }

  /** 409 `move_closed`. */
  @Post(':id/cancel')
  @HttpCode(200)
  @Can('tenancies', 'edit')
  @ZodResponse({ status: 200, type: MoveDetailDto })
  cancel(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.moves.cancel(actor, id);
  }
}
