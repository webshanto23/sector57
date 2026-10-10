import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
