import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { MembersModule } from '../members/members.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PropertyModule } from '../property/property.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AssetsController } from './assets.controller.js';
import { AssetsService } from './assets.service.js';
import { FacilitiesController } from './facilities.controller.js';
import { FacilitiesService } from './facilities.service.js';
import { MaintenanceService } from './maintenance.service.js';

/** Step 23: facilities the society runs, the assets it owns, and their upkeep. */
@Module({
  imports: [PrismaModule, AuditModule, PropertyModule, MembersModule, FinanceModule, StorageModule],
  controllers: [FacilitiesController, AssetsController],
  providers: [FacilitiesService, AssetsService, MaintenanceService],
  // The documents library checks rights on an asset's papers through it.
  exports: [AssetsService],
})
export class FacilitiesModule {}
