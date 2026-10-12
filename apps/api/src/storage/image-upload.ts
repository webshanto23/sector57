import { applyDecorators, BadRequestException, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { DOCUMENT_UPLOAD, FORM_HONEYPOT, IMAGE_UPLOAD } from '@s57/shared';

/**
 * A route that takes one image as multipart field `file` (plus optional text fields).
 * Kept in memory (at most IMAGE_UPLOAD.maxBytes, else 413) and checked by `processImage`.
 */
export const ImageUpload = (fields: Record<string, { type: 'string' }> = {}) =>
  applyDecorators(
    UseInterceptors(
      // No `dest` or `storage`: multer keeps the file in memory.
      FileInterceptor('file', {
        limits: { fileSize: IMAGE_UPLOAD.maxBytes, files: 1, fields: 10, fieldSize: 4096 },
      }),
    ),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['file'],
        properties: { file: { type: 'string', format: 'binary' }, ...fields },
      },
    }),
  );

/** The part of multer's file object the API reads. */
export type UploadedImage = { buffer: Buffer; size: number };

/** The uploaded file's bytes, or 400 `file_required`. */
export function requireUpload(file: UploadedImage | undefined): Buffer {
  if (!file?.buffer?.length) throw new BadRequestException({ code: 'file_required', message: 'Choose a photo to upload' });
  return file.buffer;
}

/**
 * A public form post: text field `data` (the answers as JSON) and an optional file `file`
 * (a photo or PDF, at most DOCUMENT_UPLOAD.maxBytes, else 413), checked by `processDocument`.
 */
export const DocumentUpload = () =>
  applyDecorators(
    UseInterceptors(
      FileInterceptor('file', {
        limits: { fileSize: DOCUMENT_UPLOAD.maxBytes, files: 1, fields: 5, fieldSize: 32 * 1024, parts: 6 },
      }),
    ),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['data'],
        properties: {
          data: { type: 'string', description: 'The answers, as JSON' },
          [FORM_HONEYPOT]: { type: 'string', description: 'Leave empty' },
          file: { type: 'string', format: 'binary' },
        },
      },
    }),
  );

/** One voucher file (a photo or PDF) as multipart field `file`, at most DOCUMENT_UPLOAD.maxBytes (else 413). */
export const VoucherUpload = () =>
  applyDecorators(
    UseInterceptors(FileInterceptor('file', { limits: { fileSize: DOCUMENT_UPLOAD.maxBytes, files: 1, fields: 2, fieldSize: 1024, parts: 3 } })),
    ApiConsumes('multipart/form-data'),
    ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } }),
  );
