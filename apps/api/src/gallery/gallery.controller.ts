import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UploadedFile } from '@nestjs/common';
import {
  albumAdminListSchema,
  albumAdminSchema,
  albumInputSchema,
  albumListQuery,
  photoAdminSchema,
  photoCaptionSchema,
  photoOrderSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { ImageUpload, requireUpload, type UploadedImage } from '../storage/image-upload.js';
import { GalleryAdminService } from './gallery-admin.service.js';

export class AlbumAdminDto extends createDto(albumAdminSchema) {}
export class AlbumAdminListDto extends createDto(albumAdminListSchema) {}
export class AlbumAdminListQueryDto extends createDto(albumListQuery) {}
export class AlbumInputDto extends createDto(albumInputSchema) {}
export class PhotoAdminDto extends createDto(photoAdminSchema) {}
export class PhotoCaptionDto extends createDto(photoCaptionSchema) {}
export class PhotoOrderDto extends createDto(photoOrderSchema) {}

/** Gallery albums and photos in the dashboard. The service writes audit rows with before and after. */
@Controller('gallery')
@SkipAudit()
export class GalleryController {
  constructor(private readonly gallery: GalleryAdminService) {}

  @Get('albums')
  @Can('gallery', 'view')
  @ZodResponse({ status: 200, type: AlbumAdminListDto })
  list(@CurrentSociety() society: SocietyContext, @Query() query: AlbumAdminListQueryDto) {
    return this.gallery.list(society.id, query);
  }

  @Get('albums/:id')
  @Can('gallery', 'view')
  @ZodResponse({ status: 200, type: AlbumAdminDto })
  get(@CurrentSociety() society: SocietyContext, @Param() { id }: IdParamDto) {
    return this.gallery.get(society.id, id);
  }

  @Post('albums')
  @Can('gallery', 'create')
  @ZodResponse({ status: 201, type: AlbumAdminDto })
  create(@CurrentActor() actor: Actor, @Body() body: AlbumInputDto) {
    return this.gallery.create(actor, body);
  }

  @Put('albums/:id')
  @Can('gallery', 'edit')
  @ZodResponse({ status: 200, type: AlbumAdminDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: AlbumInputDto) {
    return this.gallery.update(actor, id, body);
  }

  /** Deletes the album with all its photos and their files. */
  @Delete('albums/:id')
  @HttpCode(204)
  @Can('gallery', 'delete')
  async remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<void> {
    await this.gallery.remove(actor, id);
  }

  /**
   * One photo per request (multipart field `file`, optional `captionBn` and `captionEn`),
   * added at the end of the album. 415 `unsupported_image`, 413 when over 10 MB, 409 `album_full`.
   */
  @Post('albums/:id/photos')
  @Can('gallery', 'create')
  @ImageUpload({ captionBn: { type: 'string' }, captionEn: { type: 'string' } })
  @ZodResponse({ status: 201, type: PhotoAdminDto })
  addPhoto(
    @CurrentActor() actor: Actor,
    @Param() { id }: IdParamDto,
    @Body() body: PhotoCaptionDto,
    @UploadedFile() file: UploadedImage | undefined,
  ) {
    return this.gallery.addPhoto(actor, id, requireUpload(file), body);
  }

  /** Every photo of the album, in the new order (400 `invalid_order` otherwise). */
  @Put('albums/:id/photo-order')
  @Can('gallery', 'edit')
  @ZodResponse({ status: 200, type: AlbumAdminDto })
  reorder(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: PhotoOrderDto) {
    return this.gallery.reorder(actor, id, body.photoIds);
  }

  @Patch('photos/:id')
  @Can('gallery', 'edit')
  @ZodResponse({ status: 200, type: PhotoAdminDto })
  updatePhoto(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: PhotoCaptionDto) {
    return this.gallery.updatePhoto(actor, id, body);
  }

  @Delete('photos/:id')
  @HttpCode(204)
  @Can('gallery', 'delete')
  async removePhoto(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<void> {
    await this.gallery.removePhoto(actor, id);
  }
}
