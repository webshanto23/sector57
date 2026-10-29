import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import type { LocationRemoveManyInput, RemovalProblem } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isForeignKeyViolation } from '../common/prisma-errors.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { removalPlan, type RemovalNode } from './removal.policy.js';
import { beyondPermissions } from './tree.service.js';

type Reference = { tbl: string; col: string };

const refused = (problem: RemovalProblem | 'in_use', names: string[]) =>
  new ConflictException({ code: `remove_${problem}`, message: 'These cannot be removed', details: { names } });

/**
 * Removing places and units picked together on a place page (a building set up wrongly),
 * all or none. Only rows nothing else refers to go: any owner, renter, resident, bill,
 * document or other record keeps a row (deactivate it instead). The rule for what goes
 * with what is in `removal.policy.ts`.
 */
@Injectable()
export class LocationRemovalService {
  /** Columns that point at a place or unit without cascading, read once from the catalog. */
  private references?: Promise<Reference[]>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async removeMany(actor: Actor, input: LocationRemoveManyInput): Promise<{ removed: number }> {
    const societyId = actor.societyId;
    const pickedRows = await this.rows(societyId, Prisma.sql`l.id = any(${input.ids}::uuid[])`);
    if (pickedRows.length !== input.ids.length || pickedRows.some((row) => !actor.access.can('view', 'locations', { path: row.path }))) {
      throw new NotFoundException({ code: 'location_not_found', message: 'Location not found' });
    }
    const placeIds = pickedRows.filter((row) => !row.isUnit).map((row) => row.id);
    const insideRows = placeIds.length ? await this.rows(societyId, Prisma.sql`l.parent_id = any(${placeIds}::uuid[])`) : [];
    const plan = removalPlan(pickedRows, insideRows);
    if ('problem' in plan) throw refused(plan.problem, plan.names);

    const byId = new Map([...pickedRows, ...insideRows].map((row) => [row.id, row]));
    const allowed = (id: string) => {
      const row = byId.get(id)!;
      return actor.access.can('delete', row.isUnit ? 'units' : 'locations', { path: row.path });
    };
    const ids = [...plan.unitIds, ...plan.placeIds];
    if (!ids.every(allowed)) throw beyondPermissions();
    const used = await this.inUse(societyId, ids);
    if (used.length > 0) throw refused('in_use', used.map((id) => byId.get(id)!.name));

    try {
      await this.prisma.$transaction(async (tx) => {
        // Units first (their `units` rows cascade), then the places that held them.
        await tx.locations.deleteMany({ where: { society_id: societyId, id: { in: plan.unitIds } } });
        await tx.locations.deleteMany({ where: { society_id: societyId, id: { in: plan.placeIds } } });
        for (const id of ids) {
          const row = byId.get(id)!;
          await this.audit.record(
            {
              societyId,
              userId: actor.userId,
              action: 'delete',
              entityType: row.isUnit ? 'unit' : 'location',
              entityId: id,
              before: { name: row.name, code: row.code, isActive: row.isActive, removedWith: input.ids },
              ip: actor.ip,
            },
            tx,
          );
        }
      });
    } catch (error) {
      // Something started referring to a row between the check and the delete.
      if (isForeignKeyViolation(error)) throw refused('in_use', []);
      throw error;
    }
    return { removed: ids.length };
  }

  private async rows(societyId: string, where: Prisma.Sql) {
    return this.prisma.$queryRaw<(RemovalNode & { path: string; code: string | null; isActive: boolean })[]>`
      select l.id, l.name, l.code, l.path, l.parent_id as "parentId", l.is_active as "isActive", lv.is_unit_level as "isUnit",
        (u.merged_into is not null
          or exists (select 1 from units m where m.merged_into = l.id)
          or exists (select 1 from unit_storeys us where us.unit_id = l.id)) as joined
      from locations l
      join location_levels lv on lv.id = l.level_id
      left join units u on u.location_id = l.id
      where l.society_id = ${societyId}::uuid and ${where}`;
  }

  /** Ids among `ids` that another record points at, or that have documents filed under them. */
  private async inUse(societyId: string, ids: string[]): Promise<string[]> {
    const refs = (await this.catalog()).filter((ref) => !(ref.tbl === 'locations' && ref.col === 'parent_id') && !(ref.tbl === 'units' && ref.col === 'merged_into'));
    const checks = [
      ...refs.map((ref) => Prisma.sql`select ${Prisma.raw(`"${ref.col}"`)}::uuid as id from ${Prisma.raw(`"${ref.tbl}"`)} where ${Prisma.raw(`"${ref.col}"`)} = any(${ids}::uuid[])`),
      Prisma.sql`select entity_id as id from documents where society_id = ${societyId}::uuid and entity_type in ('location', 'unit') and entity_id = any(${ids}::uuid[])`,
    ];
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`select distinct id from (${Prisma.join(checks, ' union all ')}) refs`;
    return rows.map((row) => row.id);
  }

  private catalog(): Promise<Reference[]> {
    this.references ??= this.prisma.$queryRaw<Reference[]>`
      select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      cross join lateral unnest(c.conkey, c.confkey) as k(src, dst)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.src
      join pg_attribute t on t.attrelid = c.confrelid and t.attnum = k.dst
      where c.contype = 'f' and c.confdeltype <> 'c'
        and ((c.confrelid = 'locations'::regclass and t.attname = 'id') or (c.confrelid = 'units'::regclass and t.attname = 'location_id'))`.then(
      (rows) => rows.map((row) => ({ tbl: row.tbl.replaceAll('"', ''), col: row.col })),
    );
    return this.references;
  }
}
