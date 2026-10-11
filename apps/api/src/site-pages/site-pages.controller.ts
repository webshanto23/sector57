import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { EDITABLE_PAGES, sitePageAdminSchema, sitePageInputSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { SitePagesAdminService } from './site-pages-admin.service.js';

export class SitePageAdminDto extends createDto(sitePageAdminSchema) {}
export class SitePageInputDto extends createDto(sitePageInputSchema) {}
export class EditablePageParamDto extends createDto(z.object({ slug: z.enum(EDITABLE_PAGES) })) {}

/** Website content editor: home, site details and developments. Other slugs are 400. */
@Controller('site-pages')
@SkipAudit()
export class SitePagesController {
  constructor(private readonly pages: SitePagesAdminService) {}

  @Get(':slug')
  @Can('site', 'view')
  @ZodResponse({ status: 200, type: SitePageAdminDto })
  get(@CurrentSociety() society: SocietyContext, @Param() { slug }: EditablePageParamDto) {
    return this.pages.get(society.id, slug);
  }

  /** The page's whole content, checked against its schema; saving publishes it. */
  @Put(':slug')
  @Can('site', 'edit')
  @ZodResponse({ status: 200, type: SitePageAdminDto })
  save(@CurrentActor() actor: Actor, @Param() { slug }: EditablePageParamDto, @Body() body: SitePageInputDto) {
    return this.pages.save(actor, slug, body.content);
  }
}
