import { Body, Controller, Get, Put } from '@nestjs/common';
import { slaInputSchema, slaViewSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { HelpdeskService } from './helpdesk.service.js';

export class SlaInputDto extends createDto(slaInputSchema) {}
export class SlaViewDto extends createDto(slaViewSchema) {}

/** Hours to fix per ticket category. Changing them is a society setting (`settings.edit`). */
@Controller('helpdesk')
@SkipAudit()
export class HelpdeskController {
  constructor(private readonly helpdesk: HelpdeskService) {}

  @Get('sla')
  @Can('helpdesk', 'view')
  @ZodResponse({ status: 200, type: SlaViewDto })
  sla(@CurrentActor() actor: Actor) {
    return this.helpdesk.sla(actor);
  }

  @Put('sla')
  @Can('settings', 'edit')
  @ZodResponse({ status: 200, type: SlaViewDto })
  setSla(@CurrentActor() actor: Actor, @Body() body: SlaInputDto) {
    return this.helpdesk.setSla(actor, body);
  }
}
