import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  cardValidTill,
  DEFAULT_MEMBER_CARD_SETTINGS,
  MEMBER_CARD_KEY,
  memberCardSettingsSchema,
  type MemberCard,
  type MemberCardSettings,
  type MemberCardSettingsInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { mediaUrl } from '../common/media.js';
import { ENV, type Env } from '../config/env.js';
import { SettingsService } from '../finance/settings.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions } from '../property/tree.service.js';
import { auditOf, canOnParty, PartiesService } from './parties.service.js';

const membershipNotFound = () => new NotFoundException({ code: 'membership_not_found', message: 'Membership not found' });
const idPending = () =>
  new ConflictException({ code: 'membership_id_pending', message: 'The membership ID is issued once the member is verified' });
const notActive = () => new ConflictException({ code: 'membership_not_active', message: 'Only an active membership gets a card' });

const contactSelect = { full_name: true, full_name_en: true, phone: true, email: true } as const;

/**
 * Membership ID cards: the card settings (Settings > Membership, `settings` permission) and what
 * one card shows. A card is for an active membership with an ID, printed by a caller who may edit
 * the member (`members.edit` where they own, rent, live or hold the membership). Each card read is
 * audited, since it carries the photo and the phone.
 */
@Injectable()
export class MemberCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parties: PartiesService,
    private readonly finance: SettingsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async settings(societyId: string): Promise<MemberCardSettings> {
    const row = await this.prisma.society_settings.findUnique({
      where: { society_id_key: { society_id: societyId, key: MEMBER_CARD_KEY } },
      select: { value: true },
    });
    const parsed = memberCardSettingsSchema.safeParse(row?.value);
    return parsed.success ? parsed.data : DEFAULT_MEMBER_CARD_SETTINGS;
  }

  async updateSettings(actor: Actor, input: MemberCardSettingsInput): Promise<MemberCardSettings> {
    const before = await this.settings(actor.societyId);
    await this.prisma.$transaction(async (tx) => {
      await tx.society_settings.upsert({
        where: { society_id_key: { society_id: actor.societyId, key: MEMBER_CARD_KEY } },
        update: { value: input, updated_by: actor.userId, updated_at: new Date() },
        create: { society_id: actor.societyId, key: MEMBER_CARD_KEY, value: input, updated_by: actor.userId },
      });
      await this.audit.record({ ...auditOf(actor, 'member_card_settings', 'update', actor.societyId), before, after: input }, tx);
    });
    return input;
  }

  /** One card. 404 outside the caller's area, 403 without `members.edit` there, 409 while the ID is pending or the membership isn't active. */
  async card(actor: Actor, membershipId: string): Promise<MemberCard> {
    const row = await this.prisma.memberships.findFirst({
      where: { id: membershipId, society_id: actor.societyId },
      select: {
        id: true,
        membership_code: true,
        status: true,
        joined_on: true,
        person_id: true,
        organisation_id: true,
        locations: { select: { path: true } },
        persons: { select: { ...contactSelect, photo_url: true } },
        organisations: { select: { name: true, persons: { select: contactSelect } } },
      },
    });
    if (!row) throw membershipNotFound();
    const party = row.person_id ? { personId: row.person_id } : { organisationId: row.organisation_id! };
    const paths = [...(await this.parties.currentPaths(actor.societyId, party)), ...(row.locations ? [row.locations.path] : [])];
    if (!canOnParty(actor.access, 'view', paths)) throw membershipNotFound();
    if (!canOnParty(actor.access, 'edit', paths)) throw beyondPermissions();
    if (!row.membership_code) throw idPending();
    if (row.status !== 'active') throw notActive();

    const [header, settings] = await Promise.all([this.finance.receiptHeader(actor.societyId), this.settings(actor.societyId)]);
    const contact = row.persons ?? row.organisations?.persons ?? null;
    await this.audit.recordQuietly({ ...auditOf(actor, 'membership', 'card', row.id), after: { membershipCode: row.membership_code } });
    return {
      membershipId: row.id,
      membershipCode: row.membership_code,
      kind: row.persons ? 'person' : 'organisation',
      name: row.persons?.full_name ?? row.organisations?.name ?? '',
      nameEn: row.persons?.full_name_en ?? null,
      photoUrl: row.persons ? mediaUrl(row.persons.photo_url, this.env.MEDIA_BASE_URL) : null,
      phone: contact?.phone ?? null,
      email: contact?.email ?? null,
      joinedOn: isoDate(row.joined_on),
      validTill: settings.validYears ? cardValidTill(isoDate(todayDate()), settings.validYears) : null,
      status: row.status as MemberCard['status'],
      header,
      settings,
    };
  }
}
