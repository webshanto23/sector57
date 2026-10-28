import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import { formatMembershipCode, nextMemberNumber, type MembershipSettings, type MembershipSettingsInput } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;
type Client = Pick<PrismaService, 'societies' | 'society_settings' | 'memberships'>;

/** `society_settings` key holding `{ firstMemberNo }`. */
const NUMBERING_KEY = 'membership_numbering';

const codeTaken = () => new ConflictException({ code: 'society_code_taken', message: 'Another society uses this code' });

/** Serialises member numbering and code changes of one society. Held until the transaction ends. */
export async function lockMemberNumbers(tx: Tx, societyId: string): Promise<void> {
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`memberships:${societyId}`}))`;
}

/** The number the society's first member gets (1 unless the office set a starter). */
export async function firstMemberNo(client: Pick<PrismaService, 'society_settings'>, societyId: string): Promise<number> {
  const row = await client.society_settings.findUnique({
    where: { society_id_key: { society_id: societyId, key: NUMBERING_KEY } },
    select: { value: true },
  });
  const value = (row?.value as { firstMemberNo?: unknown } | undefined)?.firstMemberNo;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : 1;
}

/**
 * How membership IDs are made (`settings` permission): the society code and the first member
 * number. A new code re-issues every membership ID of the society; the starter only moves numbers
 * given from now on.
 */
@Injectable()
export class MembershipSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(societyId: string, client: Client = this.prisma): Promise<MembershipSettings> {
    const [society, start, used] = await Promise.all([
      client.societies.findUniqueOrThrow({ where: { id: societyId }, select: { code: true } }),
      firstMemberNo(client, societyId),
      client.memberships.aggregate({ where: { society_id: societyId }, _max: { member_no: true }, _count: { _all: true } }),
    ]);
    const next = nextMemberNumber(start, used._max.member_no);
    return {
      societyCode: society.code,
      firstMemberNo: start,
      issued: used._count._all,
      highestMemberNo: used._max.member_no,
      nextMemberNo: next,
      nextMembershipCode: formatMembershipCode(society.code, next),
    };
  }

  /** 409 `society_code_taken` when another society has the code. */
  async update(actor: Actor, input: MembershipSettingsInput): Promise<MembershipSettings> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockMemberNumbers(tx, actor.societyId);
        const before = await this.get(actor.societyId, tx);
        const recoded = input.societyCode !== before.societyCode;
        if (recoded) {
          await tx.societies.update({ where: { id: actor.societyId }, data: { code: input.societyCode } });
          // Setting the number to itself fires `memberships_set_code`, which rebuilds each ID from the new code.
          await tx.$executeRaw`update memberships set member_no = member_no where society_id = ${actor.societyId}::uuid`;
        }
        const value = { firstMemberNo: input.firstMemberNo };
        await tx.society_settings.upsert({
          where: { society_id_key: { society_id: actor.societyId, key: NUMBERING_KEY } },
          update: { value, updated_by: actor.userId, updated_at: new Date() },
          create: { society_id: actor.societyId, key: NUMBERING_KEY, value, updated_by: actor.userId },
        });
        const after = await this.get(actor.societyId, tx);
        await this.audit.record(
          {
            societyId: actor.societyId,
            userId: actor.userId,
            action: 'update',
            entityType: 'membership_settings',
            entityId: actor.societyId,
            before: { societyCode: before.societyCode, firstMemberNo: before.firstMemberNo },
            after: { societyCode: after.societyCode, firstMemberNo: after.firstMemberNo, reissued: recoded ? before.issued : 0 },
            ip: actor.ip,
          },
          tx,
        );
        return after;
      });
    } catch (error) {
      throw isUniqueViolation(error) ? codeTaken() : error;
    }
  }
}
