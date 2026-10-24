import { Controller, ForbiddenException, Get, Query, StreamableFile } from '@nestjs/common';
import {
  LOCALES,
  membersReportQuery,
  membersReportSchema,
  occupancyQuery,
  occupancyReportSchema,
  rentersReportQuery,
  rentersReportSchema,
  type PermissionModule,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { createDto } from '../common/create-dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { csvFile } from './csv.js';
import { membersCsv, occupancyCsv, rentersCsv } from './records-csv.js';
import { RecordsReportsService } from './records-reports.service.js';

/** The language of a CSV's headings and names. */
const lang = z.object({ lang: z.enum(LOCALES).default('bn') });

export class OccupancyQueryDto extends createDto(occupancyQuery) {}
export class OccupancyCsvQueryDto extends createDto(occupancyQuery.extend(lang.shape)) {}
export class OccupancyReportDto extends createDto(occupancyReportSchema) {}
export class MembersReportQueryDto extends createDto(membersReportQuery) {}
export class MembersCsvQueryDto extends createDto(membersReportQuery.extend(lang.shape)) {}
export class MembersReportDto extends createDto(membersReportSchema) {}
export class RentersReportQueryDto extends createDto(rentersReportQuery) {}
export class RentersCsvQueryDto extends createDto(rentersReportQuery.extend(lang.shape)) {}
export class RentersReportDto extends createDto(rentersReportSchema) {}

const forbidden = () => new ForbiddenException({ code: 'forbidden', message: 'You do not have permission for this' });

/**
 * Records reports, read-only: occupancy (`units`), members (`members`) and renters for the
 * police station (`members.export`). Each CSV (`/csv`) needs the module's `export` too.
 */
@Controller('reports')
export class RecordsReportsController {
  constructor(private readonly reports: RecordsReportsService) {}

  /** 404 `location_not_found` for a place outside the caller's area. */
  @Get('occupancy')
  @Can('units', 'view')
  @ZodResponse({ status: 200, type: OccupancyReportDto })
  occupancy(@CurrentActor() actor: Actor, @Query() query: OccupancyQueryDto) {
    return this.reports.occupancy(actor.access, actor.societyId, query);
  }

  @Get('occupancy/csv')
  @Can('units', 'export')
  async occupancyCsv(@CurrentActor() actor: Actor, @Query() query: OccupancyCsvQueryDto): Promise<StreamableFile> {
    this.need(actor, 'units');
    return csvFile('occupancy', occupancyCsv(await this.reports.occupancy(actor.access, actor.societyId, query), query.lang));
  }

  /** 400 `invalid_range`; 404 `location_not_found`. */
  @Get('members')
  @Can('members', 'view')
  @ZodResponse({ status: 200, type: MembersReportDto })
  members(@CurrentActor() actor: Actor, @Query() query: MembersReportQueryDto) {
    return this.reports.members(actor.access, actor.societyId, query);
  }

  @Get('members/csv')
  @Can('members', 'export')
  async membersCsv(@CurrentActor() actor: Actor, @Query() query: MembersCsvQueryDto): Promise<StreamableFile> {
    this.need(actor, 'members');
    const report = await this.reports.members(actor.access, actor.societyId, query);
    return csvFile(`members-${report.from}-${report.to}`, membersCsv(report, query.lang));
  }

  /** The list is itself an export. 403 `thana_sharing_off`; 404 `location_not_found`. */
  @Get('renters')
  @Can('members', 'export')
  @ZodResponse({ status: 200, type: RentersReportDto })
  renters(@CurrentActor() actor: Actor, @Query() query: RentersReportQueryDto) {
    return this.reports.renters(actor.access, actor.societyId, query);
  }

  @Get('renters/csv')
  @Can('members', 'export')
  async rentersCsv(@CurrentActor() actor: Actor, @Query() query: RentersCsvQueryDto): Promise<StreamableFile> {
    const report = await this.reports.renters(actor.access, actor.societyId, query);
    return csvFile(`renters-${report.asOf}`, rentersCsv(report, query.lang));
  }

  private need(actor: Actor, module: PermissionModule): void {
    if (!actor.access.can('view', module)) throw forbidden();
  }
}
