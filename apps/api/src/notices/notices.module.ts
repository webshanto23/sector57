import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NoticesAdminService } from './notices-admin.service.js';
import { NoticesController } from './notices.controller.js';
import { NoticesService } from './notices.service.js';
import { PublicNoticesController } from './public-notices.controller.js';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PublicNoticesController, NoticesController],
  providers: [NoticesService, NoticesAdminService],
})
export class NoticesModule {}
