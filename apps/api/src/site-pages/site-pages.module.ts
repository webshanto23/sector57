import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PublicSitePagesController } from './public-site-pages.controller.js';
import { SitePagesService } from './site-pages.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [PublicSitePagesController],
  providers: [SitePagesService],
})
export class SitePagesModule {}
