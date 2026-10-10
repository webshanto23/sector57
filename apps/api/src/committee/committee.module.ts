import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CommitteeAdminService } from './committee-admin.service.js';
import { CommitteeController } from './committee.controller.js';
import { CommitteeService } from './committee.service.js';
import { PublicCommitteeController } from './public-committee.controller.js';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PublicCommitteeController, CommitteeController],
  providers: [CommitteeService, CommitteeAdminService],
})
export class CommitteeModule {}
