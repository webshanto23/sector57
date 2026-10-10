import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/tokens.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CallerAccess } from './caller-access.js';

/** Loads a caller's roles, permissions and area scopes into a `CallerAccess`. */
@Injectable()
export class AbilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** One query: the caller's role grants in their society. A disabled user gets nothing at once. */
  async load(caller: AuthUser): Promise<CallerAccess> {
    const rows = await this.prisma.user_roles.findMany({
      where: {
        user_id: caller.userId,
        roles: { society_id: caller.societyId },
        users_user_roles_user_idTousers: { society_id: caller.societyId, status: 'active' },
      },
      select: {
        scope_location_id: true,
        locations: { select: { path: true, society_id: true } },
        roles: { select: { is_system: true, role_permissions: { select: { permissions: { select: { module: true, action: true } } } } } },
      },
    });

    return new CallerAccess(
      rows.map((row) => ({
        isSystem: row.roles.is_system,
        scopeLocationId: row.scope_location_id,
        scopePath: row.locations && row.locations.society_id === caller.societyId ? row.locations.path : null,
        permissions: row.roles.role_permissions.map((rp) => rp.permissions),
      })),
    );
  }
}
