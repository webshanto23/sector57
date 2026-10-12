import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PropertyModule } from '../property/property.module.js';
import { HandoversService } from './handovers.service.js';
import { CollectController, HandoversController, PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

/** Step 14: cash collection, receipts, voids and handovers. */
@Module({
  imports: [PrismaModule, AuditModule, FinanceModule, PropertyModule, BillingModule],
  controllers: [CollectController, PaymentsController, HandoversController],
  providers: [PaymentsService, HandoversService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
