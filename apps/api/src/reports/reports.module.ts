import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PropertyModule } from '../property/property.module.js';
import { AreaReportsService } from './area-reports.service.js';
import { DayBookService } from './day-book.service.js';
import { IncomeService } from './income.service.js';
import { ReportsController } from './reports.controller.js';

/** Step 17: finance reports (day book, collection by area, arrears, income and expenditure) and their CSV files. */
@Module({
  imports: [PrismaModule, PropertyModule],
  controllers: [ReportsController],
  providers: [DayBookService, AreaReportsService, IncomeService],
  exports: [AreaReportsService],
})
export class ReportsModule {}
