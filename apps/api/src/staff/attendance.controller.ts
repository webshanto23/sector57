import { Body, Controller, ForbiddenException, Get, Put, Query, StreamableFile } from '@nestjs/common';
import {
  attendanceCsvQuery,
  attendanceDayQuery,
  attendanceDaySchema,
  attendanceMonthQuery,
  attendanceMonthSchema,
  attendanceSaveSchema,
  LOCALES,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { csvFile } from '../reports/csv.js';
import { AttendanceService } from './attendance.service.js';

export class AttendanceDayQueryDto extends createDto(attendanceDayQuery) {}
export class AttendanceDayDto extends createDto(attendanceDaySchema) {}
export class AttendanceSaveDto extends createDto(attendanceSaveSchema) {}
export class AttendanceMonthQueryDto extends createDto(attendanceMonthQuery) {}
export class AttendanceMonthDto extends createDto(attendanceMonthSchema) {}
export class AttendanceCsvQueryDto extends createDto(attendanceCsvQuery.extend({ lang: z.enum(LOCALES).default('bn') })) {}

/** Daily attendance, under the `attendance` permission at each staff member's post. The service audits each save. */
@Controller('attendance')
@SkipAudit()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  /** The day's roster: everyone working that day in the caller's area. */
  @Get()
  @Can('attendance', 'view')
  @ZodResponse({ status: 200, type: AttendanceDayDto })
  day(@CurrentActor() actor: Actor, @Query() query: AttendanceDayQueryDto) {
    return this.attendance.day(actor, query);
  }

  /** 400 `future_date`; 403 `attendance_locked`; 404 `staff_not_found`; 409 `staff_not_current`. */
  @Put()
  @Can('attendance', 'edit')
  @ZodResponse({ status: 200, type: AttendanceDayDto })
  save(@CurrentActor() actor: Actor, @Body() body: AttendanceSaveDto) {
    return this.attendance.save(actor, body);
  }

  @Get('month')
  @Can('attendance', 'view')
  @ZodResponse({ status: 200, type: AttendanceMonthDto })
  month(@CurrentActor() actor: Actor, @Query() query: AttendanceMonthQueryDto) {
    return this.attendance.month(actor, query);
  }

  /** The month's counts per staff member. Needs `attendance.export` as well as `attendance.view`. */
  @Get('csv')
  @Can('attendance', 'export')
  async csv(@CurrentActor() actor: Actor, @Query() query: AttendanceCsvQueryDto): Promise<StreamableFile> {
    if (!actor.access.can('view', 'attendance')) throw new ForbiddenException({ code: 'forbidden', message: 'You do not have permission for this' });
    return csvFile(`attendance-${query.month}`, await this.attendance.csv(actor, query, query.lang));
  }
}
