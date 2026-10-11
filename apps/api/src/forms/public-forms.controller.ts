import { Body, Controller, Get, HttpCode, Ip, Param, Post, Query, UploadedFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FORM_HONEYPOT } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { Public, SkipCsrf } from '../auth/auth.decorators.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { DocumentUpload, type UploadedImage } from '../storage/image-upload.js';
import { FormKeyParamDto, FormReceiptDto, PublicPlaceListDto, PublicPlaceQueryDto } from './forms.dto.js';
import { PublicFormsService } from './public-forms.service.js';

/**
 * The public membership and renter forms. No login; the browser posts through the web app's
 * `/api` proxy, so the rate limits see the visitor's address (Nginx and Next pass it on).
 */
@Public()
@Controller('public')
export class PublicFormsController {
  constructor(private readonly forms: PublicFormsService) {}

  /** The address dropdowns: active children of `parentId` (the top of the tree without it). Names and levels only. */
  @Get('locations')
  @ZodResponse({ status: 200, type: PublicPlaceListDto })
  async places(@CurrentSociety() society: SocietyContext, @Query() query: PublicPlaceQueryDto) {
    return { items: await this.forms.places(society.id, query.parentId) };
  }

  /**
   * Multipart: `data` (the answers as JSON), optional `file` (photo or PDF up to 5 MB; required
   * for membership) and the honeypot field. 409 `already_submitted` for the same open application,
   * 429 after a few a day from one phone or too many from one address.
   */
  @Post('forms/:formKey')
  @HttpCode(201)
  // Visitors have no CSRF cookie yet; the Origin check still runs.
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @DocumentUpload()
  @ZodResponse({ status: 201, type: FormReceiptDto })
  submit(
    @CurrentSociety() society: SocietyContext,
    @Param() { formKey }: FormKeyParamDto,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: UploadedImage | undefined,
    @Ip() ip: string | undefined,
  ) {
    return this.forms.submit(society.id, formKey, body['data'], file?.buffer, body[FORM_HONEYPOT], ip ?? null);
  }
}
