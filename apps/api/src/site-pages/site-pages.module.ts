import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PublicSitePagesController } from './public-site-pages.controller.js';
import { SitePagesAdminService } from './site-pages-admin.service.js';
import { SitePagesController } from './site-pages.controller.js';
import { SitePagesService } from './site-pages.service.js';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PublicSitePagesController, SitePagesController],
  providers: [SitePagesService, SitePagesAdminService],
})
export class SitePagesModule {}
