import { Controller, Get, Param, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ZodResponse } from 'nestjs-zod';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { NoticeDto, NoticeIdParamDto, NoticeListDto, NoticeListQueryDto } from './notices.dto.js';
import { NoticesService } from './notices.service.js';

/** Notice board of the public website: no login, read-only. */
@Controller('public/notices')
// Called by the Next.js server, so every visitor shares one IP here; per-visitor limits belong in Nginx.
@SkipThrottle()
export class PublicNoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get()
  @ZodResponse({ status: 200, type: NoticeListDto })
  list(@CurrentSociety() society: SocietyContext, @Query() query: NoticeListQueryDto) {
    return this.notices.listPublic(society.id, query);
  }

  @Get(':id')
  @ZodResponse({ status: 200, type: NoticeDto })
  get(@CurrentSociety() society: SocietyContext, @Param() params: NoticeIdParamDto) {
    return this.notices.getPublic(society.id, params.id);
  }
}
