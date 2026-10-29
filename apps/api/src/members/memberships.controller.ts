import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  memberBulkResultSchema,
  memberBulkSchema,
  memberCreatedSchema,
  memberCreateSchema,
  membershipSettingsInputSchema,
  membershipSettingsSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { MembershipSettingsService } from './membership-settings.service.js';
import { MembershipsService } from './memberships.service.js';

export class MemberCreateDto extends createDto(memberCreateSchema) {}
export class MemberCreatedDto extends createDto(memberCreatedSchema) {}
export class MemberBulkDto extends createDto(memberBulkSchema) {}
export class MemberBulkResultDto extends createDto(memberBulkResultSchema) {}
export class MembershipSettingsDto extends createDto(membershipSettingsSchema) {}
export class MembershipSettingsInputDto extends createDto(membershipSettingsInputSchema) {}

/** Society members. The service writes the audit rows. */
@Controller('memberships')
@SkipAudit()
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  /**
   * The office adds a member: new details (matched by phone or NID, else added) or `personId`.
   * Whole-society callers only (403 otherwise). 404 for an unknown person or place; 409
   * `already_member`, or when the phone and NID match two people.
   */
  @Post()
  @Can('members', 'create')
  @ZodResponse({ status: 201, type: MemberCreatedDto })
  create(@CurrentActor() actor: Actor, @Body() body: MemberCreateDto) {
    return this.memberships.create(actor, body);
  }

  /** People on file (ticked on the owners or renters list) made members in one go; members already are skipped. */
  @Post('bulk')
  @Can('members', 'create')
  @ZodResponse({ status: 201, type: MemberBulkResultDto })
  bulk(@CurrentActor() actor: Actor, @Body() body: MemberBulkDto) {
    return this.memberships.bulk(actor, body);
  }

  /** A membership made by mistake, while it has no ID. 409 `membership_has_id` or `membership_has_bills` (not void); whole-society callers only. */
  @Delete(':id')
  @HttpCode(204)
  @Can('members', 'delete')
  async remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<void> {
    await this.memberships.remove(actor, id);
  }
}

/** How membership IDs are made: the society code and the first member number. The service writes the audit row. */
@Controller('settings/membership')
@SkipAudit()
export class MembershipSettingsController {
  constructor(private readonly settings: MembershipSettingsService) {}

  @Get()
  @Can('settings', 'view')
  @ZodResponse({ status: 200, type: MembershipSettingsDto })
  get(@CurrentActor() actor: Actor) {
    return this.settings.get(actor.societyId);
  }

  /** A new code re-issues every membership ID of the society. 409 `society_code_taken`. */
  @Put()
  @Can('settings', 'edit')
  @ZodResponse({ status: 200, type: MembershipSettingsDto })
  update(@CurrentActor() actor: Actor, @Body() body: MembershipSettingsInputDto) {
    return this.settings.update(actor, body);
  }
}
