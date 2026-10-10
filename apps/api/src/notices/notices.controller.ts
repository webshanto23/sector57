import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { noticeAdminListQuery, noticeAdminListSchema, noticeAdminSchema, noticeInputSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { NoticesAdminService } from './notices-admin.service.js';

export class NoticeAdminDto extends createDto(noticeAdminSchema) {}
export class NoticeAdminListDto extends createDto(noticeAdminListSchema) {}
export class NoticeAdminListQueryDto extends createDto(noticeAdminListQuery) {}
export class NoticeInputDto extends createDto(noticeInputSchema) {}

/** Notices in the dashboard. The service writes audit rows with before and after. */
@Controller('notices')
@SkipAudit()
export class NoticesController {
  constructor(private readonly notices: NoticesAdminService) {}

  @Get()
  @Can('notices', 'view')
  @ZodResponse({ status: 200, type: NoticeAdminListDto })
  list(@CurrentSociety() society: SocietyContext, @Query() query: NoticeAdminListQueryDto) {
    return this.notices.list(society.id, query);
  }

  @Get(':id')
  @Can('notices', 'view')
  @ZodResponse({ status: 200, type: NoticeAdminDto })
  get(@CurrentSociety() society: SocietyContext, @Param() { id }: IdParamDto) {
    return this.notices.get(society.id, id);
  }

  @Post()
  @Can('notices', 'create')
  @ZodResponse({ status: 201, type: NoticeAdminDto })
  create(@CurrentActor() actor: Actor, @Body() body: NoticeInputDto) {
    return this.notices.create(actor, body);
  }

  /** The whole notice. */
  @Put(':id')
  @Can('notices', 'edit')
  @ZodResponse({ status: 200, type: NoticeAdminDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: NoticeInputDto) {
    return this.notices.update(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('notices', 'delete')
  async remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<void> {
    await this.notices.remove(actor, id);
  }
}
