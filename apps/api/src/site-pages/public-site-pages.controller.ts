import { Controller, Get, Param } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { pageSlug, sitePageSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { createDto } from '../common/create-dto.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { SitePagesService } from './site-pages.service.js';

export class SitePageDto extends createDto(sitePageSchema) {}
export class PageSlugParamDto extends createDto(z.object({ slug: pageSlug })) {}

/** Published CMS pages for the public website (home, site footer, developments ...). */
@Controller('public/pages')
// Called by the Next.js server, so every visitor shares one IP here; per-visitor limits belong in Nginx.
@SkipThrottle()
export class PublicSitePagesController {
  constructor(private readonly pages: SitePagesService) {}

  @Get(':slug')
  @ZodResponse({ status: 200, type: SitePageDto })
  get(@CurrentSociety() society: SocietyContext, @Param() params: PageSlugParamDto) {
    return this.pages.getPublished(society.id, params.slug);
  }
}
