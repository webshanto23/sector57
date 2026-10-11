import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditModule } from '../audit/audit.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { MembersModule } from '../members/members.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PropertyModule } from '../property/property.module.js';
import { BillToService } from './bill-to.service.js';
import { BillingRunsJob } from './billing-runs.job.js';
import { BillingRunsService } from './billing-runs.service.js';
import { BillingLookupController, InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';
import { BillingRunsController, SchedulesController } from './schedules.controller.js';
import { SchedulesService } from './schedules.service.js';

/** Steps 12 and 13: bills (by hand, opening arrears), recurring charges and billing runs. */
@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, AuditModule, FinanceModule, MembersModule, PropertyModule],
  controllers: [InvoicesController, BillingLookupController, SchedulesController, BillingRunsController],
  providers: [BillToService, InvoicesService, SchedulesService, BillingRunsService, BillingRunsJob],
  exports: [BillToService, InvoicesService],
})
export class BillingModule {}
