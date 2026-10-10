import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { GalleryAdminService } from './gallery-admin.service.js';
import { GalleryController } from './gallery.controller.js';
import { GalleryService } from './gallery.service.js';
import { PublicGalleryController } from './public-gallery.controller.js';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PublicGalleryController, GalleryController],
  providers: [GalleryService, GalleryAdminService],
})
export class GalleryModule {}
