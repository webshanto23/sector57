import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { MembersModule } from '../members/members.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CertificateActionsService } from './certificate-actions.service.js';
import { CertificatesController } from './certificates.controller.js';
import { CertificatesService } from './certificates.service.js';

/** Step 28: certificates and NOCs for a person at a unit, numbered from `NumberingService` when issued. */
@Module({
  imports: [PrismaModule, AuditModule, MembersModule, FinanceModule],
  controllers: [CertificatesController],
  providers: [CertificatesService, CertificateActionsService],
})
export class CertificatesModule {}
