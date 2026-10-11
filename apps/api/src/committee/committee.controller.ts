import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UploadedFile } from '@nestjs/common';
import {
  committeeSeatCreateSchema,
  committeeSeatListSchema,
  committeeSeatSchema,
  committeeSeatUpdateSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { ImageUpload, requireUpload, type UploadedImage } from '../storage/image-upload.js';
import { CommitteeAdminService } from './committee-admin.service.js';

export class CommitteeSeatDto extends createDto(committeeSeatSchema) {}
export class CommitteeSeatListDto extends createDto(committeeSeatListSchema) {}
export class CommitteeSeatCreateDto extends createDto(committeeSeatCreateSchema) {}
export class CommitteeSeatUpdateDto extends createDto(committeeSeatUpdateSchema) {}

/** Committee seats in the dashboard. The service writes audit rows with before and after. */
@Controller('committee/members')
@SkipAudit()
export class CommitteeController {
  constructor(private readonly committee: CommitteeAdminService) {}

  @Get()
  @Can('committee', 'view')
  @ZodResponse({ status: 200, type: CommitteeSeatListDto })
  list(@CurrentSociety() society: SocietyContext) {
    return this.committee.list(society.id);
  }

  @Get(':id')
  @Can('committee', 'view')
  @ZodResponse({ status: 200, type: CommitteeSeatDto })
  get(@CurrentSociety() society: SocietyContext, @Param() { id }: IdParamDto) {
    return this.committee.get(society.id, id);
  }

  @Post()
  @Can('committee', 'create')
  @ZodResponse({ status: 201, type: CommitteeSeatDto })
  create(@CurrentActor() actor: Actor, @Body() body: CommitteeSeatCreateDto) {
    return this.committee.create(actor, body);
  }

  @Put(':id')
  @Can('committee', 'edit')
  @ZodResponse({ status: 200, type: CommitteeSeatDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: CommitteeSeatUpdateDto) {
    return this.committee.update(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('committee', 'delete')
  async remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<void> {
    await this.committee.remove(actor, id);
  }

  /** Multipart field `file`: JPEG, PNG or WebP up to 10 MB (415 `unsupported_image`, 413 too large). */
  @Post(':id/photo')
  @HttpCode(200)
  @Can('committee', 'edit')
  @ImageUpload()
  @ZodResponse({ status: 200, type: CommitteeSeatDto })
  setPhoto(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @UploadedFile() file: UploadedImage | undefined) {
    return this.committee.setPhoto(actor, id, requireUpload(file));
  }

  @Delete(':id/photo')
  @Can('committee', 'edit')
  @ZodResponse({ status: 200, type: CommitteeSeatDto })
  removePhoto(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.committee.removePhoto(actor, id);
  }
}
