import { Controller, Get, Query } from '@nestjs/common';
import { auditListQuery, auditListSchema, auditOptionsSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { createDto } from '../common/create-dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { AuditLogService } from './audit-log.service.js';

export class AuditListQueryDto extends createDto(auditListQuery) {}
export class AuditListDto extends createDto(auditListSchema) {}
export class AuditOptionsDto extends createDto(auditOptionsSchema) {}

/** The audit log viewer (`audit.view`, society-wide). Read-only: there is no route that changes the log. */
@Controller('audit')
export class AuditLogController {
  constructor(private readonly log: AuditLogService) {}

  /** Newest first. Dates are Dhaka days, both included. */
  @Get()
  @Can('audit', 'view')
  @ZodResponse({ status: 200, type: AuditListDto })
  list(@CurrentActor() actor: Actor, @Query() query: AuditListQueryDto) {
    return this.log.list(actor.societyId, query);
  }

  @Get('options')
  @Can('audit', 'view')
  @ZodResponse({ status: 200, type: AuditOptionsDto })
  options(@CurrentActor() actor: Actor) {
    return this.log.options(actor.societyId);
  }
}
