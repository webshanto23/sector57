import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { MembersModule } from '../members/members.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DonationsController } from './donations.controller.js';
import { DonationsService } from './donations.service.js';

/** Step 15: donations, each with a receipt from the Step 14 series. */
@Module({
  imports: [PrismaModule, AuditModule, FinanceModule, MembersModule, BillingModule, PaymentsModule],
  controllers: [DonationsController],
  providers: [DonationsService],
})
export class DonationsModule {}
