import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query, StreamableFile, UploadedFile } from '@nestjs/common';
import { documentCreateSchema, documentListQuery, documentListSchema, documentSchema, documentUpdateSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { LibraryUpload, requireUpload, type UploadedImage } from '../storage/image-upload.js';
import { DocumentsService } from './documents.service.js';

export class DocumentListQueryDto extends createDto(documentListQuery) {}
export class DocumentListDto extends createDto(documentListSchema) {}
export class DocumentDto extends createDto(documentSchema) {}
export class DocumentCreateDto extends createDto(documentCreateSchema) {}
export class DocumentUpdateDto extends createDto(documentUpdateSchema) {}

/**
 * The documents library: society papers and documents kept with a person or a place. Each
 * route needs its `documents` grant; a person's or place's documents also need the right on
 * that record (404 when it can't be seen). The service writes its own audit rows.
 */
@Controller('documents')
@SkipAudit()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @Can('documents', 'view')
  @ZodResponse({ status: 200, type: DocumentListDto })
  list(@CurrentActor() actor: Actor, @Query() query: DocumentListQueryDto) {
    return this.documents.list(actor, query);
  }

  @Get(':id')
  @Can('documents', 'view')
  @ZodResponse({ status: 200, type: DocumentDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.documents.get(actor, id);
  }

  /** Photos open in the browser; PDFs always download. */
  @Get(':id/file')
  @Can('documents', 'view')
  @Header('Cache-Control', 'private, no-store')
  async file(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<StreamableFile> {
    const file = await this.documents.file(actor, id);
    const inline = file.contentType.startsWith('image/');
    return new StreamableFile(file.data, {
      type: file.contentType,
      disposition: `${inline ? 'inline' : 'attachment'}; filename="${file.fileName}"`,
      length: file.data.length,
    });
  }

  /** Multipart: `file` with `entityType`, `entityId`, `docType`, `title`. 415 `unsupported_document`, 409 `too_many_documents`. */
  @Post()
  @Can('documents', 'create')
  @LibraryUpload()
  @ZodResponse({ status: 201, type: DocumentDto })
  create(@CurrentActor() actor: Actor, @Body() body: DocumentCreateDto, @UploadedFile() file: UploadedImage | undefined) {
    return this.documents.create(actor, body, requireUpload(file));
  }

  /** 400 `invalid_doc_type`. */
  @Patch(':id')
  @Can('documents', 'edit')
  @ZodResponse({ status: 200, type: DocumentDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: DocumentUpdateDto) {
    return this.documents.update(actor, id, body);
  }

  /** 409 `document_archived`. The file is kept. */
  @Post(':id/archive')
  @HttpCode(200)
  @Can('documents', 'edit')
  @ZodResponse({ status: 200, type: DocumentDto })
  archive(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.documents.archive(actor, id, true);
  }

  /** 409 `document_not_archived`. */
  @Post(':id/restore')
  @HttpCode(200)
  @Can('documents', 'edit')
  @ZodResponse({ status: 200, type: DocumentDto })
  restore(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.documents.archive(actor, id, false);
  }
}
