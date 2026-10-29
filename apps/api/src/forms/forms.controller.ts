import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, StreamableFile, UploadedFile } from '@nestjs/common';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { DocumentUpload, type UploadedImage } from '../storage/image-upload.js';
import {
  FormApproveDto,
  FormDetailDto,
  FormEntryDto,
  FormFileParamDto,
  FormKeyParamDto,
  FormListDto,
  FormListQueryDto,
  FormRejectDto,
  FormReviewDto,
} from './forms.dto.js';
import { FormsService } from './forms.service.js';
import { PublicFormsService } from './public-forms.service.js';

/** The office's review queue. The service checks every row against the caller's area and writes the audit rows. */
@Controller('forms')
@SkipAudit()
export class FormsController {
  constructor(
    private readonly forms: FormsService,
    private readonly entries: PublicFormsService,
  ) {}

  @Get()
  @Can('forms', 'view')
  @ZodResponse({ status: 200, type: FormListDto })
  list(@CurrentActor() actor: Actor, @Query() query: FormListQueryDto) {
    return this.forms.list(actor, query);
  }

  @Get(':id')
  @Can('forms', 'view')
  @ZodResponse({ status: 200, type: FormDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.forms.get(actor, id);
  }

  /**
   * The office types in an application: multipart like the public form (`data` as JSON, the
   * `file`; required for membership). Needs `forms.view` and `forms.create` at the place (403
   * otherwise); 409 `already_submitted` for the same open application. No daily limit per phone.
   */
  @Post(':formKey')
  @HttpCode(201)
  @Can('forms', 'create')
  @DocumentUpload()
  @ZodResponse({ status: 201, type: FormEntryDto })
  enter(
    @CurrentActor() actor: Actor,
    @Param() { formKey }: FormKeyParamDto,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: UploadedImage | undefined,
  ) {
    return this.entries.enter(actor, formKey, body['data'], file?.buffer);
  }

  /** An attached deed or NID copy. Photos open in the browser; PDFs always download. */
  @Get(':id/files/:fileId')
  @Can('forms', 'view')
  @Header('Cache-Control', 'private, no-store')
  async file(@CurrentActor() actor: Actor, @Param() { id, fileId }: FormFileParamDto): Promise<StreamableFile> {
    const file = await this.forms.file(actor, id, fileId);
    const inline = file.contentType.startsWith('image/');
    return new StreamableFile(file.data, {
      type: file.contentType,
      disposition: `${inline ? 'inline' : 'attachment'}; filename="${file.fileName}"`,
      length: file.data.length,
    });
  }

  /** `new` → `in_review` (409 `form_closed` otherwise). */
  @Post(':id/review')
  @HttpCode(200)
  @Can('forms', 'edit')
  @ZodResponse({ status: 200, type: FormDetailDto })
  review(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: FormReviewDto) {
    return this.forms.review(actor, id, body);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Can('forms', 'approve')
  @ZodResponse({ status: 200, type: FormDetailDto })
  approve(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: FormApproveDto) {
    return this.forms.approve(actor, id, body);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Can('forms', 'approve')
  @ZodResponse({ status: 200, type: FormDetailDto })
  reject(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: FormRejectDto) {
    return this.forms.reject(actor, id, body);
  }
}
