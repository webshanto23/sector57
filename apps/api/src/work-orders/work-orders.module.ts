import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { ExpensesModule } from '../expenses/expenses.module.js';
import { FacilitiesModule } from '../facilities/facilities.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { HelpdeskModule } from '../helpdesk/helpdesk.module.js';
import { MembersModule } from '../members/members.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PropertyModule } from '../property/property.module.js';
import { WorkOrderActionsService } from './work-order-actions.service.js';
import { WorkOrdersController } from './work-orders.controller.js';
import { WorkOrdersService } from './work-orders.service.js';

/** Step 24: work orders, the jobs that fix a ticket or look after an asset. */
@Module({
  imports: [PrismaModule, AuditModule, PropertyModule, MembersModule, FinanceModule, HelpdeskModule, FacilitiesModule, ExpensesModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, WorkOrderActionsService],
})
export class WorkOrdersModule {}
