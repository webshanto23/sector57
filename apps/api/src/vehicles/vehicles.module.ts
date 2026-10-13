import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { MembersModule } from '../members/members.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PropertyModule } from '../property/property.module.js';
import { ParkingController } from './parking.controller.js';
import { ParkingService } from './parking.service.js';
import { StickerActionsService } from './sticker-actions.service.js';
import { StickersController } from './stickers.controller.js';
import { StickersService } from './stickers.service.js';
import { VehiclesController } from './vehicles.controller.js';
import { VehiclesService } from './vehicles.service.js';

/** Step 25: vehicles at units, their stickers (billed through `InvoicesService` when there is a fee) and parking slots. */
@Module({
  imports: [PrismaModule, AuditModule, MembersModule, PropertyModule, FinanceModule, BillingModule],
  controllers: [VehiclesController, StickersController, ParkingController],
  providers: [VehiclesService, StickersService, StickerActionsService, ParkingService],
})
export class VehiclesModule {}
