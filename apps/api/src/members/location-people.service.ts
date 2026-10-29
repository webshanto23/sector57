import { Injectable } from '@nestjs/common';
import type { LocationPeople, PermissionAction, PermissionModule } from '@s57/shared';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { locationNotFound, pathIds, TreeService } from '../property/tree.service.js';
import { MemberRowsService } from './member-rows.service.js';

/** Who owns, rents and lives at one location, for its page in the dashboard. */
@Injectable()
export class LocationPeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
    private readonly rows: MemberRowsService,
  ) {}

  /** 404 unless the caller may view at least one of owners, tenancies or households here. */
  async get(actor: Actor, id: string): Promise<LocationPeople> {
    const location = await this.tree.find(actor.societyId, id);
    const at = location ? { path: location.path } : null;
    const may = (action: PermissionAction, module: PermissionModule) => (at ? actor.access.can(action, module, at) : false);
    const sees = { ownerships: may('view', 'ownerships'), tenancies: may('view', 'tenancies'), members: may('view', 'members') };
    if (!location || !(sees.ownerships || sees.tenancies || sees.members)) throw locationNotFound();

    const unit = location.isUnit;
    const above = pathIds(location.path).slice(0, -1);
    const [owners, aboveRows, aboveLevels, tenancies, occupants] = await Promise.all([
      sees.ownerships ? this.rows.ownerships(actor.societyId, { location_id: id }) : null,
      // Only owners of places inside the caller's area: a block manager doesn't see the sector's owner.
      sees.ownerships
        ? this.rows.ownerships(actor.societyId, {
            location_id: { in: above },
            end_date: null,
            locations: scopeWhere(actor.access, 'view', 'ownerships', (prefix) => ({ path: { startsWith: prefix } })),
          })
        : null,
      sees.ownerships && above.length > 0
        ? this.prisma.locations.findMany({
            where: { society_id: actor.societyId, id: { in: above } },
            select: { id: true, location_levels: { select: { name_bn: true, name_en: true } } },
          })
        : [],
      unit && sees.tenancies ? this.rows.tenancies(actor.societyId, { unit_id: id }) : null,
      unit && sees.members ? this.rows.occupants(actor.societyId, { unit_id: id }) : null,
    ]);
    const levels = new Map(aboveLevels.map((row) => [row.id, row.location_levels]));
    const ownersAbove =
      aboveRows?.map((row) => ({ ...row, levelBn: levels.get(row.place.id)?.name_bn ?? '', levelEn: levels.get(row.place.id)?.name_en ?? null })) ?? null;
    const actions = (module: PermissionModule) => ({
      create: may('create', module),
      edit: may('edit', module),
      delete: may('delete', module),
    });
    const none = { create: false, edit: false, delete: false };
    return {
      location: { id: location.id, name: location.name, isUnit: unit },
      owners,
      ownersAbove,
      tenancies,
      occupants,
      can: {
        ownerships: actions('ownerships'),
        tenancies: unit ? actions('tenancies') : none,
        occupants: unit ? actions('members') : none,
      },
    };
  }
}
