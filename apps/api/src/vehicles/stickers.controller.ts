import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Query, StreamableFile } from '@nestjs/common';
import {
  LOCALES,
  stickerCsvQuery,
  stickerIssueSchema,
  stickerListQuery,
  stickerListSchema,
  stickerRenewResultSchema,
  stickerRenewSchema,
  stickerRevokeSchema,
  stickerRowSchema,
  stickerSheetQuery,
  stickerSheetSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { csvFile } from '../reports/csv.js';
import { StickerActionsService } from './sticker-actions.service.js';
import { stickerCsv } from './sticker-csv.js';
import { StickersService } from './stickers.service.js';

export class StickerListQueryDto extends createDto(stickerListQuery) {}
export class StickerListDto extends createDto(stickerListSchema) {}
export class StickerCsvQueryDto extends createDto(stickerCsvQuery.extend({ lang: z.enum(LOCALES).default('bn') })) {}
export class StickerRowDto extends createDto(stickerRowSchema) {}
export class StickerIssueDto extends createDto(stickerIssueSchema) {}
export class StickerRenewDto extends createDto(stickerRenewSchema) {}
export class StickerRenewResultDto extends createDto(stickerRenewResultSchema) {}
export class StickerRevokeDto extends createDto(stickerRevokeSchema) {}
export class StickerSheetQueryDto extends createDto(stickerSheetQuery) {}
export class StickerSheetDto extends createDto(stickerSheetSchema) {}

/** Vehicle stickers, under the `vehicles` permission where the vehicle's unit is. The services write their own audit rows. */
@Controller('stickers')
@SkipAudit()
export class StickersController {
  constructor(
    private readonly stickers: StickersService,
    private readonly actions: StickerActionsService,
  ) {}

  @Get()
  @Can('vehicles', 'view')
  @ZodResponse({ status: 200, type: StickerListDto })
  list(@CurrentActor() actor: Actor, @Query() query: StickerListQueryDto) {
    return this.stickers.list(actor, query);
  }

  /** Needs `vehicles.export` as well as `vehicles.view`. */
  @Get('csv')
  @Can('vehicles', 'export')
  async csv(@CurrentActor() actor: Actor, @Query() query: StickerCsvQueryDto): Promise<StreamableFile> {
    if (!actor.access.can('view', 'vehicles')) throw new ForbiddenException({ code: 'forbidden', message: 'You do not have permission for this' });
    return csvFile('stickers', stickerCsv(await this.stickers.all(actor, query), query.lang));
  }

  /** The stickers in force among `ids`, with the society's header, to print on A4. */
  @Get('sheet')
  @Can('vehicles', 'view')
  @ZodResponse({ status: 200, type: StickerSheetDto })
  sheet(@CurrentActor() actor: Actor, @Query() { ids }: StickerSheetQueryDto) {
    return this.stickers.sheet(actor, ids);
  }

  @Get(':id')
  @Can('vehicles', 'view')
  @ZodResponse({ status: 200, type: StickerRowDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.stickers.get(actor, id);
  }

  /**
   * 404 `vehicle_not_found`; 409 `sticker_in_force`, `vehicle_removed`, `vehicle_person_not_at_unit`;
   * 403 `sticker_fee_needs_billing` when there is a fee and the caller may not bill the unit.
   */
  @Post()
  @Can('vehicles', 'create')
  @ZodResponse({ status: 201, type: StickerRowDto })
  issue(@CurrentActor() actor: Actor, @Body() body: StickerIssueDto) {
    return this.actions.issue(actor, body);
  }

  /** Each sticker renewed or skipped with the code its single renewal would give. */
  @Post('renew')
  @HttpCode(200)
  @Can('vehicles', 'create')
  @ZodResponse({ status: 200, type: StickerRenewResultDto })
  renew(@CurrentActor() actor: Actor, @Body() body: StickerRenewDto) {
    return this.actions.renew(actor, body.stickerIds);
  }

  /** Lost or damaged. 409 `sticker_not_active`, `sticker_expired`, `vehicle_removed`, `vehicle_person_not_at_unit`. */
  @Post(':id/replace')
  @HttpCode(200)
  @Can('vehicles', 'create')
  @ZodResponse({ status: 200, type: StickerRowDto })
  replace(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.actions.replace(actor, id);
  }

  /** 409 `sticker_not_active`. */
  @Post(':id/revoke')
  @HttpCode(200)
  @Can('vehicles', 'edit')
  @ZodResponse({ status: 200, type: StickerRowDto })
  revoke(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: StickerRevokeDto) {
    return this.actions.revoke(actor, id, body);
  }
}
