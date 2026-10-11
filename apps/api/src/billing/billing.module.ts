import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { MembersModule } from '../members/members.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PropertyModule } from '../property/property.module.js';
import { BillToService } from './bill-to.service.js';
import { BillingLookupController, InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';

/** Step 12: bills (invoices), made by hand, and opening arrears. */
@Module({
  imports: [PrismaModule, AuditModule, FinanceModule, MembersModule, PropertyModule],
  controllers: [InvoicesController, BillingLookupController],
  providers: [BillToService, InvoicesService],
  exports: [BillToService, InvoicesService],
})
export class BillingModule {}
