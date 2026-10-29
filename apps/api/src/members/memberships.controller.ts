import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  memberBulkResultSchema,
  memberBulkSchema,
  memberCreatedSchema,
  memberCreateSchema,
  memberCardSchema,
  memberCardSettingsInputSchema,
  memberCardSettingsSchema,
  membershipSettingsInputSchema,
  membershipSettingsSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { MemberCardService } from './member-card.service.js';
import { MembershipSettingsService } from './membership-settings.service.js';
import { MembershipsService } from './memberships.service.js';

export class MemberCreateDto extends createDto(memberCreateSchema) {}
export class MemberCreatedDto extends createDto(memberCreatedSchema) {}
export class MemberBulkDto extends createDto(memberBulkSchema) {}
export class MemberBulkResultDto extends createDto(memberBulkResultSchema) {}
export class MembershipSettingsDto extends createDto(membershipSettingsSchema) {}
export class MembershipSettingsInputDto extends createDto(membershipSettingsInputSchema) {}
export class MemberCardDto extends createDto(memberCardSchema) {}
export class MemberCardSettingsDto extends createDto(memberCardSettingsSchema) {}
export class MemberCardSettingsInputDto extends createDto(memberCardSettingsInputSchema) {}

/** Society members. The service writes the audit rows. */
@Controller('memberships')
@SkipAudit()
export class MembershipsController {
  constructor(
    private readonly memberships: MembershipsService,
    private readonly cards: MemberCardService,
  ) {}

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

  /**
   * What the member's ID card shows. Needs `members.edit` where the member owns, rents, lives or
   * holds the membership (404 outside the area, 403 otherwise); 409 `membership_id_pending` or
   * `membership_not_active`.
   */
  @Get(':id/card')
  @Can('members', 'edit')
  @ZodResponse({ status: 200, type: MemberCardDto })
  card(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.cards.card(actor, id);
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

/** What the back of the membership ID card says and how long a card is valid. The service writes the audit row. */
@Controller('settings/member-card')
@SkipAudit()
export class MemberCardSettingsController {
  constructor(private readonly cards: MemberCardService) {}

  @Get()
  @Can('settings', 'view')
  @ZodResponse({ status: 200, type: MemberCardSettingsDto })
  get(@CurrentActor() actor: Actor) {
    return this.cards.settings(actor.societyId);
  }

  @Put()
  @Can('settings', 'edit')
  @ZodResponse({ status: 200, type: MemberCardSettingsDto })
  update(@CurrentActor() actor: Actor, @Body() body: MemberCardSettingsInputDto) {
    return this.cards.updateSettings(actor, body);
  }
}
