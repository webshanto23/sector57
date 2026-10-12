import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LedgerController } from './ledger.controller.js';
import { LedgerService } from './ledger.service.js';
import { TransfersService } from './transfers.service.js';

/** Step 17: the fund ledger statement, fund transfers and bank deposits. */
@Module({
  imports: [PrismaModule, AuditModule, FinanceModule],
  controllers: [LedgerController],
  providers: [LedgerService, TransfersService],
})
export class LedgerModule {}
