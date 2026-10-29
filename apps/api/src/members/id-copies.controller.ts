import { Controller, Delete, Get, Header, HttpCode, Param, Post, StreamableFile, UploadedFile } from '@nestjs/common';
import { idCopyParam, licencePagesSchema, nidCopiesSchema, nidSideParam } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { ImageUpload, requireUpload, VoucherUpload, type UploadedImage } from '../storage/image-upload.js';
import { IdCopiesService } from './id-copies.service.js';

export class NidCopiesDto extends createDto(nidCopiesSchema) {}
export class LicencePagesDto extends createDto(licencePagesSchema) {}
export class NidSideParamDto extends createDto(nidSideParam) {}
export class IdCopyParamDto extends createDto(idCopyParam) {}

/** Photos open in the browser; PDFs always download. */
const toStream = (file: { data: Buffer; contentType: string; fileName: string }) =>
  new StreamableFile(file.data, {
    type: file.contentType,
    disposition: `${file.contentType.startsWith('image/') ? 'inline' : 'attachment'}; filename="${file.fileName}"`,
    length: file.data.length,
  });

/** NID copies (front and back) of a person. Every route needs the right to edit the person; the service writes the audit rows. */
@Controller('persons')
@SkipAudit()
export class PersonIdCopiesController {
  constructor(private readonly copies: IdCopiesService) {}

  @Get(':id/nid-copy')
  @Can('members', 'edit')
  @ZodResponse({ status: 200, type: NidCopiesDto })
  list(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.copies.nidCopies(actor, id);
  }

  /** Multipart field `file`: a photo (JPEG, PNG or WebP) up to 10 MB; replaces the side's copy. 415 `unsupported_image`. */
  @Post(':id/nid-copy/:side')
  @HttpCode(200)
  @Can('members', 'edit')
  @ImageUpload()
  @ZodResponse({ status: 200, type: NidCopiesDto })
  set(@CurrentActor() actor: Actor, @Param() { id, side }: NidSideParamDto, @UploadedFile() file: UploadedImage | undefined) {
    return this.copies.setNidSide(actor, id, side, requireUpload(file));
  }

  /** 404 `id_copy_not_found`. The copy is archived, not deleted. */
  @Delete(':id/nid-copy/:side')
  @Can('members', 'edit')
  @ZodResponse({ status: 200, type: NidCopiesDto })
  remove(@CurrentActor() actor: Actor, @Param() { id, side }: NidSideParamDto) {
    return this.copies.removeNidSide(actor, id, side);
  }

  @Get(':id/id-copies/:docId/file')
  @Can('members', 'edit')
  @Header('Cache-Control', 'private, no-store')
  async file(@CurrentActor() actor: Actor, @Param() { id, docId }: IdCopyParamDto): Promise<StreamableFile> {
    return toStream(await this.copies.file(actor, { kind: 'person', id }, docId));
  }
}

/** Trade licence pages of an organisation. Every route needs the right to edit the organisation. */
@Controller('organisations')
@SkipAudit()
export class OrganisationIdCopiesController {
  constructor(private readonly copies: IdCopiesService) {}

  @Get(':id/licence-pages')
  @Can('members', 'edit')
  @ZodResponse({ status: 200, type: LicencePagesDto })
  list(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.copies.licencePages(actor, id);
  }

  /** Multipart field `file`: a photo or PDF up to 5 MB. 415 `unsupported_document`, 409 `too_many_licence_pages`. */
  @Post(':id/licence-pages')
  @HttpCode(200)
  @Can('members', 'edit')
  @VoucherUpload()
  @ZodResponse({ status: 200, type: LicencePagesDto })
  add(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @UploadedFile() file: UploadedImage | undefined) {
    return this.copies.addLicencePage(actor, id, requireUpload(file));
  }

  /** 404 `id_copy_not_found`. The page is archived, not deleted. */
  @Delete(':id/licence-pages/:docId')
  @Can('members', 'edit')
  @ZodResponse({ status: 200, type: LicencePagesDto })
  remove(@CurrentActor() actor: Actor, @Param() { id, docId }: IdCopyParamDto) {
    return this.copies.removeLicencePage(actor, id, docId);
  }

  @Get(':id/licence-pages/:docId/file')
  @Can('members', 'edit')
  @Header('Cache-Control', 'private, no-store')
  async file(@CurrentActor() actor: Actor, @Param() { id, docId }: IdCopyParamDto): Promise<StreamableFile> {
    return toStream(await this.copies.file(actor, { kind: 'organisation', id }, docId));
  }
}
