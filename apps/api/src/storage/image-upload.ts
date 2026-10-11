import { applyDecorators, BadRequestException, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { IMAGE_UPLOAD } from '@s57/shared';

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
