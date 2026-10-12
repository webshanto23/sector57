import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import {
  LOCALES,
  staffCreateSchema,
  staffCsvQuery,
  staffDetailSchema,
  staffLeaveSchema,
  staffListQuery,
  staffListSchema,
  staffRejoinSchema,
  staffUpdateSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { csvFile } from '../reports/csv.js';
import { staffCsv } from './staff-csv.js';
import { seesPay, StaffService } from './staff.service.js';

export class StaffListQueryDto extends createDto(staffListQuery) {}
export class StaffListDto extends createDto(staffListSchema) {}
export class StaffCsvQueryDto extends createDto(staffCsvQuery.extend({ lang: z.enum(LOCALES).default('bn') })) {}
export class StaffDetailDto extends createDto(staffDetailSchema) {}
export class StaffCreateDto extends createDto(staffCreateSchema) {}
export class StaffUpdateDto extends createDto(staffUpdateSchema) {}
export class StaffLeaveDto extends createDto(staffLeaveSchema) {}
export class StaffRejoinDto extends createDto(staffRejoinSchema) {}

/** Staff, under the `staff` permission at each one's post. The service writes its own audit rows. */
@Controller('staff')
@SkipAudit()
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @Can('staff', 'view')
  @ZodResponse({ status: 200, type: StaffListDto })
  list(@CurrentActor() actor: Actor, @Query() query: StaffListQueryDto) {
    return this.staff.list(actor, query);
  }

  /** Needs `staff.export` as well as `staff.view`. Never an NID; pay only for society-wide staff editors. */
  @Get('csv')
  @Can('staff', 'export')
  async csv(@CurrentActor() actor: Actor, @Query() query: StaffCsvQueryDto): Promise<StreamableFile> {
    if (!actor.access.can('view', 'staff')) throw new ForbiddenException({ code: 'forbidden', message: 'You do not have permission for this' });
    const list = await this.staff.all(actor, query);
    return csvFile('staff', staffCsv(list, query.lang, seesPay(actor.access)));
  }

  @Get(':id')
  @Can('staff', 'view')
  @ZodResponse({ status: 200, type: StaffDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.staff.get(actor, id);
  }

  /** 409 `staff_current_exists`, `person_conflict`. */
  @Post()
  @Can('staff', 'create')
  @ZodResponse({ status: 201, type: StaffDetailDto })
  create(@CurrentActor() actor: Actor, @Body() body: StaffCreateDto) {
    return this.staff.create(actor, body);
  }

  /** 409 `staff_left`, `attendance_before_join`, `person_phone_taken`, `person_nid_taken`. */
  @Patch(':id')
  @Can('staff', 'edit')
  @ZodResponse({ status: 200, type: StaffDetailDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: StaffUpdateDto) {
    return this.staff.update(actor, id, body);
  }

  /** 400 `future_date`, `end_before_start`; 409 `staff_left`, `attendance_after_leave`. */
  @Post(':id/leave')
  @HttpCode(200)
  @Can('staff', 'edit')
  @ZodResponse({ status: 200, type: StaffDetailDto })
  leave(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: StaffLeaveDto) {
    return this.staff.leave(actor, id, body);
  }

  /** A new stint (201, the new row). 400 `rejoin_before_leave`; 409 `staff_not_left`, `staff_current_exists`. */
  @Post(':id/rejoin')
  @Can('staff', 'create')
  @ZodResponse({ status: 201, type: StaffDetailDto })
  rejoin(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: StaffRejoinDto) {
    return this.staff.rejoin(actor, id, body);
  }
}
