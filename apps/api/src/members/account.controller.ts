import { Body, Controller, Delete, HttpCode, Patch, Post, UploadedFile } from '@nestjs/common';
import { meUpdateSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { MeDto } from '../auth/auth.dto.js';
import { createDto } from '../common/create-dto.js';
import { Authenticated, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { ImageUpload, requireUpload, type UploadedImage } from '../storage/image-upload.js';
import { AccountService } from './account.service.js';

export class MeUpdateDto extends createDto(meUpdateSchema) {}

/** The logged-in user's own name and photo (their person record). Open to every logged-in user; the service audits. */
@Controller('me')
@Authenticated()
@SkipAudit()
export class AccountController {
  constructor(private readonly account: AccountService) {}

  /** Creates the user's person on first save. 409 `name_locked` once the person is verified. */
  @Patch()
  @ZodResponse({ status: 200, type: MeDto })
  update(@CurrentActor() actor: Actor, @Body() body: MeUpdateDto) {
    return this.account.update(actor, body);
  }

  /** Multipart field `file`: JPEG, PNG or WebP up to 10 MB. 409 `name_required` before a name is saved. */
  @Post('photo')
  @HttpCode(200)
  @ImageUpload()
  @ZodResponse({ status: 200, type: MeDto })
  setPhoto(@CurrentActor() actor: Actor, @UploadedFile() file: UploadedImage | undefined) {
    return this.account.setPhoto(actor, requireUpload(file));
  }

  @Delete('photo')
  @ZodResponse({ status: 200, type: MeDto })
  removePhoto(@CurrentActor() actor: Actor) {
    return this.account.removePhoto(actor);
  }
}
