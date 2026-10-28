import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { LevelsInput, LocationLevel } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

const levelInUse = (message: string) => new ConflictException({ code: 'level_in_use', message });

// Depths and names are unique per society, so a save first parks every kept level here.
const PARKED_DEPTH = 100;

/** The levels of the tree (`location_levels`), top first. The last one holds the units. */
@Injectable()
export class LevelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(societyId: string): Promise<LocationLevel[]> {
    const rows = await this.prisma.location_levels.findMany({
      where: { society_id: societyId },
      select: { id: true, depth: true, name_bn: true, name_en: true, is_unit_level: true, can_own: true, _count: { select: { locations: true } } },
      orderBy: { depth: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      depth: row.depth,
      nameBn: row.name_bn,
      nameEn: row.name_en,
      isUnitLevel: row.is_unit_level,
      canOwn: row.can_own,
      locationCount: row._count.locations,
    }));
  }

  /**
   * Saves the whole list. Levels in use keep their order among themselves and can't be
   * removed, so every location stays deeper than its parent; the unit level stays the
   * unit level while units exist. Unused levels can be added, removed and moved freely.
   */
  async replace(actor: Actor, input: LevelsInput): Promise<LocationLevel[]> {
    const current = await this.list(actor.societyId);
    const byId = new Map(current.map((level) => [level.id, level]));
    if (input.levels.some((level) => level.id !== null && !byId.has(level.id))) {
      throw new BadRequestException({ code: 'invalid_level', message: 'Unknown level' });
    }

    const keptIds = new Set(input.levels.flatMap((level) => (level.id ? [level.id] : [])));
    const removed = current.filter((level) => !keptIds.has(level.id));
    if (removed.some((level) => level.locationCount > 0)) throw levelInUse('A level in use cannot be removed');

    const usedBefore = current.filter((level) => level.locationCount > 0).map((level) => level.id);
    const usedAfter = input.levels.flatMap((level) => (level.id && byId.get(level.id)!.locationCount > 0 ? [level.id] : []));
    if (usedBefore.join() !== usedAfter.join()) throw levelInUse('Levels in use must keep their order');

    const last = input.levels.at(-1)!;
    const unitLevel = current.find((level) => level.isUnitLevel);
    if (unitLevel && unitLevel.locationCount > 0 && last.id !== unitLevel.id) {
      throw levelInUse('The unit level holds units and must stay last');
    }
    if (last.id && last.id !== unitLevel?.id && byId.get(last.id)!.locationCount > 0) {
      throw levelInUse('A level in use cannot become the unit level');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.location_levels.deleteMany({ where: { id: { in: removed.map((level) => level.id) }, society_id: actor.societyId } });
        const kept = input.levels.filter((level) => level.id !== null);
        for (const [index, level] of kept.entries()) {
          await tx.location_levels.update({ where: { id: level.id! }, data: { depth: PARKED_DEPTH + index, name_bn: `~${level.id}` } });
        }
        for (const [index, level] of input.levels.entries()) {
          const data = { depth: index + 1, name_bn: level.nameBn, name_en: level.nameEn, is_unit_level: index === input.levels.length - 1, can_own: level.canOwn };
          if (level.id) await tx.location_levels.update({ where: { id: level.id }, data });
          else await tx.location_levels.create({ data: { ...data, society_id: actor.societyId } });
        }
        await this.audit.record(
          {
            societyId: actor.societyId,
            userId: actor.userId,
            action: 'update',
            entityType: 'location_levels',
            entityId: null,
            before: current.map(({ id, nameBn, nameEn, isUnitLevel, canOwn }) => ({ id, nameBn, nameEn, isUnitLevel, canOwn })),
            after: input.levels,
            ip: actor.ip,
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ code: 'level_name_taken', message: 'Two levels have the same name' });
      throw error;
    }
    return this.list(actor.societyId);
  }
}
