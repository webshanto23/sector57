import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import {
  cardValidTill,
  DEFAULT_MEMBER_CARD_SETTINGS,
  MEMBER_CARD_KEY,
  memberCardSettingsSchema,
  type CardSkipCode,
  type DocumentHeader,
  type MemberCard,
  type MemberCards,
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
import { auditOf, canOnParty, PartiesService } from './parties.service.js';

/** The error each refusal answers a single card with (the batch lists the codes instead). */
const refusals: Record<CardSkipCode, () => Error> = {
  membership_not_found: () => new NotFoundException({ code: 'membership_not_found', message: 'Membership not found' }),
  beyond_your_permissions: () => new ForbiddenException({ code: 'beyond_your_permissions', message: 'This is outside what you may change' }),
  membership_id_pending: () =>
    new ConflictException({ code: 'membership_id_pending', message: 'The membership ID is issued once the member is verified' }),
  membership_not_active: () => new ConflictException({ code: 'membership_not_active', message: 'Only an active membership gets a card' }),
};

const contactSelect = { full_name: true, full_name_en: true, phone: true, email: true } as const;
const cardSelect = {
  id: true,
  membership_code: true,
  status: true,
  joined_on: true,
  person_id: true,
  organisation_id: true,
  locations: { select: { path: true } },
  persons: { select: { ...contactSelect, photo_url: true } },
  organisations: { select: { name: true, persons: { select: contactSelect } } },
} satisfies Prisma.membershipsSelect;
type CardRow = Prisma.membershipsGetPayload<{ select: typeof cardSelect }>;

/**
 * Membership ID cards: the card settings (Settings > Membership, `settings` permission) and what
 * the cards show. A card is for an active membership with an ID, printed by a caller who may edit
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
    const { items, skipped } = await this.cards(actor, [membershipId]);
    if (skipped[0]) throw refusals[skipped[0].code]();
    return items[0]!;
  }

  /** Cards for memberships ticked on the members list, in that order; the others are listed with why they got none. */
  async cards(actor: Actor, membershipIds: string[]): Promise<MemberCards> {
    const rows = await this.prisma.memberships.findMany({ where: { id: { in: membershipIds }, society_id: actor.societyId }, select: cardSelect });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const checked = await Promise.all(
      membershipIds.map(async (id) => ({ id, row: byId.get(id) ?? null, code: await this.refusal(actor, byId.get(id) ?? null) })),
    );
    const allowed = checked.filter((item): item is { id: string; row: CardRow; code: null } => item.code === null && item.row !== null);
    if (allowed.length === 0) return { items: [], skipped: checked.map(({ id, code }) => ({ membershipId: id, code: code! })) };

    const [header, settings] = await Promise.all([this.finance.receiptHeader(actor.societyId), this.settings(actor.societyId)]);
    const today = isoDate(todayDate());
    for (const { row } of allowed) {
      await this.audit.recordQuietly({ ...auditOf(actor, 'membership', 'card', row.id), after: { membershipCode: row.membership_code } });
    }
    return {
      items: allowed.map(({ row }) => this.toCard(row, header, settings, today)),
      skipped: checked.filter((item) => item.code !== null).map(({ id, code }) => ({ membershipId: id, code: code! })),
    };
  }

  /** Why the caller gets no card for this membership; null when they do. */
  private async refusal(actor: Actor, row: CardRow | null): Promise<CardSkipCode | null> {
    if (!row) return 'membership_not_found';
    const party = row.person_id ? { personId: row.person_id } : { organisationId: row.organisation_id! };
    const paths = [...(await this.parties.currentPaths(actor.societyId, party)), ...(row.locations ? [row.locations.path] : [])];
    if (!canOnParty(actor.access, 'view', paths)) return 'membership_not_found';
    if (!canOnParty(actor.access, 'edit', paths)) return 'beyond_your_permissions';
    if (!row.membership_code) return 'membership_id_pending';
    if (row.status !== 'active') return 'membership_not_active';
    return null;
  }

  private toCard(row: CardRow, header: DocumentHeader, settings: MemberCardSettings, today: string): MemberCard {
    const contact = row.persons ?? row.organisations?.persons ?? null;
    return {
      membershipId: row.id,
      membershipCode: row.membership_code!,
      kind: row.persons ? 'person' : 'organisation',
      name: row.persons?.full_name ?? row.organisations?.name ?? '',
      nameEn: row.persons?.full_name_en ?? null,
      photoUrl: row.persons ? mediaUrl(row.persons.photo_url, this.env.MEDIA_BASE_URL) : null,
      phone: contact?.phone ?? null,
      email: contact?.email ?? null,
      joinedOn: isoDate(row.joined_on),
      validTill: settings.validYears ? cardValidTill(today, settings.validYears) : null,
      status: row.status as MemberCard['status'],
      header,
      settings,
    };
  }
}
