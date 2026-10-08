import { Controller, Get, Param, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { albumListQuery, albumListSchema, albumSchema, uuid } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { createDto } from '../common/create-dto.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { GalleryService } from './gallery.service.js';

export class AlbumDto extends createDto(albumSchema) {}
export class AlbumListDto extends createDto(albumListSchema) {}
export class AlbumListQueryDto extends createDto(albumListQuery) {}
export class AlbumIdParamDto extends createDto(z.object({ id: uuid })) {}

/** Photo gallery of the public website. */
@Controller('public/gallery')
// Called by the Next.js server, so every visitor shares one IP here; per-visitor limits belong in Nginx.
@SkipThrottle()
export class PublicGalleryController {
  constructor(private readonly gallery: GalleryService) {}

  @Get()
  @ZodResponse({ status: 200, type: AlbumListDto })
  list(@CurrentSociety() society: SocietyContext, @Query() query: AlbumListQueryDto) {
    return this.gallery.listPublic(society.id, query);
  }

  @Get(':id')
  @ZodResponse({ status: 200, type: AlbumDto })
  get(@CurrentSociety() society: SocietyContext, @Param() params: AlbumIdParamDto) {
    return this.gallery.getPublic(society.id, params.id);
  }
}
