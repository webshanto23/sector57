import { Body, Controller, Get, Patch } from '@nestjs/common';
import { settingsInputSchema, societySettingsSchema } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { SettingsService } from './settings.service.js';

export class SocietySettingsDto extends createDto(societySettingsSchema) {}
export class SettingsInputDto extends createDto(settingsInputSchema) {}

/** The president's switches, the fiscal year and the receipt header. The service writes its own audit row. */
@Controller('settings')
@SkipAudit()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Can('settings', 'view')
  @ZodResponse({ status: 200, type: SocietySettingsDto })
  get(@CurrentSociety() society: SocietyContext) {
    return this.settings.get(society.id);
  }

  /** Only the keys being changed; unknown keys are refused. */
  @Patch()
  @Can('settings', 'edit')
  @ZodResponse({ status: 200, type: SocietySettingsDto })
  update(@CurrentActor() actor: Actor, @CurrentSociety() society: SocietyContext, @Body() body: SettingsInputDto) {
    return this.settings.update(actor, society.slug, body);
  }
}
