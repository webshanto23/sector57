import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { ExpensesModule } from '../expenses/expenses.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PayrollDraftService } from './payroll-draft.service.js';
import { PayrollPayService } from './payroll-pay.service.js';
import { PayrollController } from './payroll.controller.js';
import { PayrollService } from './payroll.service.js';

/** Step 26: monthly payroll runs from staff pay and attendance, paid through `ExpensesService`. */
@Module({
  imports: [PrismaModule, AuditModule, FinanceModule, ExpensesModule],
  controllers: [PayrollController],
  providers: [PayrollService, PayrollDraftService, PayrollPayService],
  exports: [PayrollService],
})
export class PayrollModule {}
