import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { LocalFileStorage } from './local-storage.js';
import { MediaService } from './media.service.js';
import { PrivateFilesService } from './private-files.service.js';
import { FILE_STORAGE, PRIVATE_FILE_STORAGE } from './storage.js';

/**
 * File storage for uploads: local disk under MEDIA_DIR (DigitalOcean Spaces later), and
 * private documents under PRIVATE_MEDIA_DIR, which is never served directly.
 */
@Global()
@Module({
  providers: [
    { provide: FILE_STORAGE, inject: [ENV], useFactory: (env: Env) => new LocalFileStorage(env.MEDIA_DIR) },
    { provide: PRIVATE_FILE_STORAGE, inject: [ENV], useFactory: (env: Env) => new LocalFileStorage(env.PRIVATE_MEDIA_DIR) },
    MediaService,
    PrivateFilesService,
  ],
  exports: [FILE_STORAGE, MediaService, PrivateFilesService],
})
export class StorageModule {}
