import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { LocalFileStorage } from './local-storage.js';
import { MediaService } from './media.service.js';
import { FILE_STORAGE } from './storage.js';

/** File storage for uploads: local disk under MEDIA_DIR (DigitalOcean Spaces later). */
@Global()
@Module({
  providers: [
    { provide: FILE_STORAGE, inject: [ENV], useFactory: (env: Env) => new LocalFileStorage(env.MEDIA_DIR) },
    MediaService,
  ],
  exports: [FILE_STORAGE, MediaService],
})
export class StorageModule {}
