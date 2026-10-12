import { Controller, ForbiddenException, Get, Query, StreamableFile } from '@nestjs/common';
import {
  arrearsQuery,
  arrearsReportSchema,
  collectionQuery,
  collectionReportSchema,
  dayBookQuery,
  dayBookSchema,
  incomeQuery,
  incomeReportSchema,
  LOCALES,
  type PermissionModule,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { createDto } from '../common/create-dto.js';
import { Authenticated, Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { AreaReportsService } from './area-reports.service.js';
import { csvFile } from './csv.js';
import { DAY_BOOK_MODULES, DayBookService, type Sections } from './day-book.service.js';
import { IncomeService } from './income.service.js';
import { arrearsCsv, collectionCsv, dayBookCsv, incomeCsv } from './report-csv.js';

/** The language of a CSV's headings and names. */
const lang = z.object({ lang: z.enum(LOCALES).default('bn') });

export class DayBookQueryDto extends createDto(dayBookQuery) {}
export class DayBookCsvQueryDto extends createDto(dayBookQuery.extend(lang.shape)) {}
export class DayBookDto extends createDto(dayBookSchema) {}
export class CollectionQueryDto extends createDto(collectionQuery) {}
export class CollectionCsvQueryDto extends createDto(collectionQuery.extend(lang.shape)) {}
export class CollectionReportDto extends createDto(collectionReportSchema) {}
export class ArrearsQueryDto extends createDto(arrearsQuery) {}
export class ArrearsCsvQueryDto extends createDto(arrearsQuery.extend(lang.shape)) {}
export class ArrearsReportDto extends createDto(arrearsReportSchema) {}
export class IncomeQueryDto extends createDto(incomeQuery) {}
export class IncomeCsvQueryDto extends createDto(incomeQuery.extend(lang.shape)) {}
export class IncomeReportDto extends createDto(incomeReportSchema) {}

const forbidden = () => new ForbiddenException({ code: 'forbidden', message: 'You do not have permission for this' });

/**
 * Finance reports, read-only. Each needs its source module's `view`; its CSV (`/csv`, UTF-8
 * with a byte order mark) needs that module's `export` too. The day book shows the sections
 * the caller may see.
 */
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly dayBook: DayBookService,
    private readonly areas: AreaReportsService,
    private readonly income: IncomeService,
  ) {}

  /** Bill receipts (`payments.view`, in the caller's area), donations, expenses, transfers and funds, each with its `view`. */
  @Get('day-book')
  @Authenticated()
  @ZodResponse({ status: 200, type: DayBookDto })
  getDayBook(@CurrentActor() actor: Actor, @Query() query: DayBookQueryDto) {
    return this.dayBook.build(actor.access, actor.societyId, query.date, this.sections(actor, ['view']));
  }

  /** Only the sections the caller may both view and export. */
  @Get('day-book/csv')
  @Authenticated()
  async dayBookCsv(@CurrentActor() actor: Actor, @Query() query: DayBookCsvQueryDto): Promise<StreamableFile> {
    const book = await this.dayBook.build(actor.access, actor.societyId, query.date, this.sections(actor, ['view', 'export']));
    return csvFile(`day-book-${book.date}`, dayBookCsv(book, query.lang));
  }

  /** 400 `invalid_range`; 404 `location_not_found` for a place outside the caller's area. */
  @Get('collection')
  @Can('billing', 'view')
  @ZodResponse({ status: 200, type: CollectionReportDto })
  collection(@CurrentActor() actor: Actor, @Query() query: CollectionQueryDto) {
    return this.areas.collection(actor.access, actor.societyId, query);
  }

  @Get('collection/csv')
  @Can('billing', 'export')
  async collectionCsv(@CurrentActor() actor: Actor, @Query() query: CollectionCsvQueryDto): Promise<StreamableFile> {
    this.need(actor, 'billing', 'view');
    const report = await this.areas.collection(actor.access, actor.societyId, query);
    return csvFile(`collection-${report.from}-${report.to}`, collectionCsv(report, query.lang));
  }

  @Get('arrears')
  @Can('billing', 'view')
  @ZodResponse({ status: 200, type: ArrearsReportDto })
  arrears(@CurrentActor() actor: Actor, @Query() query: ArrearsQueryDto) {
    return this.areas.arrears(actor.access, actor.societyId, query);
  }

  @Get('arrears/csv')
  @Can('billing', 'export')
  async arrearsCsv(@CurrentActor() actor: Actor, @Query() query: ArrearsCsvQueryDto): Promise<StreamableFile> {
    this.need(actor, 'billing', 'view');
    const report = await this.areas.arrears(actor.access, actor.societyId, query);
    return csvFile(`arrears-${report.asOf}`, arrearsCsv(report, query.lang));
  }

  /** 400 `invalid_year`; 404 `fund_not_found`. Budgets show with `budgets.view`, for all funds only. */
  @Get('income')
  @Can('ledger', 'view')
  @ZodResponse({ status: 200, type: IncomeReportDto })
  getIncome(@CurrentActor() actor: Actor, @Query() query: IncomeQueryDto) {
    return this.income.build(actor.societyId, query, actor.access.can('view', 'budgets'));
  }

  @Get('income/csv')
  @Can('ledger', 'export')
  async incomeCsv(@CurrentActor() actor: Actor, @Query() query: IncomeCsvQueryDto): Promise<StreamableFile> {
    this.need(actor, 'ledger', 'view');
    const report = await this.income.build(actor.societyId, query, actor.access.can('view', 'budgets'));
    return csvFile(`income-${report.year}`, incomeCsv(report, query.lang));
  }

  /** The day book sections the caller gets with all of `actions`; 403 when none. */
  private sections(actor: Actor, actions: ('view' | 'export')[]): Sections {
    const allowed = new Set<PermissionModule>(DAY_BOOK_MODULES.filter((module) => actions.every((action) => actor.access.can(action, module))));
    if (allowed.size === 0) throw forbidden();
    return (module) => allowed.has(module);
  }

  private need(actor: Actor, module: PermissionModule, action: 'view'): void {
    if (!actor.access.can(action, module)) throw forbidden();
  }
}
