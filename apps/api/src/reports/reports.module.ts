import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PropertyModule } from '../property/property.module.js';
import { AreaReportsService } from './area-reports.service.js';
import { CollectionRegisterService } from './collection-register.service.js';
import { DayBookService } from './day-book.service.js';
import { IncomeService } from './income.service.js';
import { RecordsReportsController } from './records-reports.controller.js';
import { RecordsReportsService } from './records-reports.service.js';
import { ReportsController } from './reports.controller.js';

/**
 * Step 17: finance reports (day book, collection by area, arrears, income and expenditure); Step 29:
 * records reports (occupancy by area, members, renters for the police station); Step 33: the
 * collection register; their CSV files.
 */
@Module({
  imports: [PrismaModule, PropertyModule],
  controllers: [ReportsController, RecordsReportsController],
  providers: [DayBookService, AreaReportsService, IncomeService, RecordsReportsService, CollectionRegisterService],
  exports: [AreaReportsService],
})
export class ReportsModule {}
