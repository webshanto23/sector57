import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { OverviewController } from './overview.controller.js';
import { OverviewService } from './overview.service.js';

/** Step 18: the dashboard overview, read-only sums over billing, payments, units, forms and expenses. */
@Module({
  imports: [PrismaModule, ReportsModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
