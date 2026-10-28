import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import type { UnitTypeItem, UnitTypesInput } from '@s57/shared';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { isForeignKeyViolation, isUniqueViolation } from '../common/prisma-errors.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = PrismaService | Prisma.TransactionClient;

const typeInUse = () => new ConflictException({ code: 'unit_type_in_use', message: 'A unit type in use cannot be removed' });

/** Units keep the code, so a new type only needs one nobody else has. */
const newCode = () => `t_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

/** The society's unit types (`unit_types`), in display order. Units and charge schedules point at their codes. */
@Injectable()
export class UnitTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(societyId: string): Promise<UnitTypeItem[]> {
    const [rows, schedules] = await Promise.all([
      this.prisma.unit_types.findMany({
        where: { society_id: societyId },
        select: { id: true, code: true, name_bn: true, name_en: true, _count: { select: { units: true } } },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      }),
      this.prisma.$queryRaw<{ code: string; count: bigint }[]>`
        SELECT code, count(*) AS count FROM charge_schedules, unnest(unit_types) AS code
        WHERE society_id = ${societyId}::uuid GROUP BY code`,
    ]);
    const scheduleCount = new Map(schedules.map((row) => [row.code, Number(row.count)]));
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      nameBn: row.name_bn,
      nameEn: row.name_en,
      unitCount: row._count.units,
      scheduleCount: scheduleCount.get(row.code) ?? 0,
    }));
  }

  /** Refuses a unit type code the society doesn't have. */
  async assertCodes(societyId: string, codes: string[], db: Db = this.prisma): Promise<void> {
    const wanted = [...new Set(codes)];
    if (wanted.length === 0) return;
    const found = await db.unit_types.count({ where: { society_id: societyId, code: { in: wanted } } });
    if (found !== wanted.length) throw new BadRequestException({ code: 'invalid_unit_type', message: 'Unknown unit type' });
  }

  /**
   * Saves the whole list. Types keep their code when renamed or moved; a type used by a unit
   * or a charge schedule can't be removed (a schedule naming only removed types would bill
   * every unit).
   */
  async replace(actor: Actor, input: UnitTypesInput): Promise<UnitTypeItem[]> {
    const current = await this.list(actor.societyId);
    const byId = new Map(current.map((type) => [type.id, type]));
    if (input.types.some((type) => type.id !== null && !byId.has(type.id))) {
      throw new BadRequestException({ code: 'invalid_unit_type', message: 'Unknown unit type' });
    }
    const keptIds = new Set(input.types.flatMap((type) => (type.id ? [type.id] : [])));
    const removed = current.filter((type) => !keptIds.has(type.id));
    if (removed.some((type) => type.unitCount > 0 || type.scheduleCount > 0)) throw typeInUse();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.unit_types.deleteMany({ where: { id: { in: removed.map((type) => type.id) }, society_id: actor.societyId } });
        // Names are unique per society, so kept types are parked first and two names can swap.
        for (const type of input.types) {
          if (type.id) await tx.unit_types.update({ where: { id: type.id }, data: { name_bn: `~${type.id}` } });
        }
        for (const [index, type] of input.types.entries()) {
          const data = { name_bn: type.nameBn, name_en: type.nameEn, sort_order: index + 1, updated_at: new Date() };
          if (type.id) await tx.unit_types.update({ where: { id: type.id }, data });
          else await tx.unit_types.create({ data: { ...data, society_id: actor.societyId, code: newCode() } });
        }
        await this.audit.record(
          {
            societyId: actor.societyId,
            userId: actor.userId,
            action: 'update',
            entityType: 'unit_types',
            entityId: null,
            before: current.map(({ id, code, nameBn, nameEn }) => ({ id, code, nameBn, nameEn })),
            after: input.types,
            ip: actor.ip,
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ code: 'unit_type_name_taken', message: 'Two unit types have the same name' });
      // A unit took the type between the check and the delete.
      if (isForeignKeyViolation(error)) throw typeInUse();
      throw error;
    }
    return this.list(actor.societyId);
  }
}
