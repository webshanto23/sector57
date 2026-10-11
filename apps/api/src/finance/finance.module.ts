import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SocietyModule } from '../society/society.module.js';
import { ChargeTypesController } from './charge-types.controller.js';
import { ChargeTypesService } from './charge-types.service.js';
import { FundsController } from './funds.controller.js';
import { FundsService } from './funds.service.js';
import { NumberingService } from './numbering.service.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

/** Step 11: finance setup. Society settings, funds and opening balances, charge types, document numbers. */
@Module({
  imports: [PrismaModule, AuditModule, SocietyModule],
  controllers: [SettingsController, FundsController, ChargeTypesController],
  providers: [SettingsService, FundsService, ChargeTypesService, NumberingService],
  exports: [SettingsService, FundsService, NumberingService],
})
export class FinanceModule {}
