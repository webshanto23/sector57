import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { BudgetsService } from './budgets.service.js';
import { ExpenseSetupService } from './expense-setup.service.js';
import { BudgetsController, ExpenseHeadsController, ExpensesController, VendorsController } from './expenses.controller.js';
import { ExpensesService } from './expenses.service.js';

/** Step 16: expense heads, vendors, the expense flow with vouchers, and budgets. */
@Module({
  imports: [PrismaModule, AuditModule, FinanceModule, StorageModule],
  controllers: [ExpensesController, ExpenseHeadsController, VendorsController, BudgetsController],
  providers: [ExpensesService, ExpenseSetupService, BudgetsService],
  // Finishing a work order with a cost raises a request through it.
  exports: [ExpensesService],
})
export class ExpensesModule {}
