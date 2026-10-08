import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { GalleryService } from './gallery.service.js';
import { PublicGalleryController } from './public-gallery.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [PublicGalleryController],
  providers: [GalleryService],
})
export class GalleryModule {}
