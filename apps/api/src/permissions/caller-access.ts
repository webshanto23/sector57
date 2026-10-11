import { createMongoAbility, subject, type MongoAbility } from '@casl/ability';
import {
  isLocationScoped,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type Access,
  type PermissionAction,
  type PermissionGrant,
  type PermissionModule,
} from '@s57/shared';

/** One `user_roles` row of the caller, with its role's permissions and its scope's path. */
export type RoleGrantRow = {
  isSystem: boolean;
  scopeLocationId: string | null;
  /** `locations.path` of the scope; null when the role is unscoped, or the scope is missing or in another society. */
  scopePath: string | null;
  permissions: { module: string; action: string }[];
};

/** A row in the location tree, for row-level checks: its `locations.path` (or its location's). */
export type LocatedRow = { path: string };

type Subject = PermissionModule | 'all';
export type AppAbility = MongoAbility<[PermissionAction | 'manage', Subject | (LocatedRow & { __caslSubjectType__: Subject })]>;

const knownModule = (value: string): value is PermissionModule => (PERMISSION_MODULES as readonly string[]).includes(value);
const knownAction = (value: string): value is PermissionAction => (PERMISSION_ACTIONS as readonly string[]).includes(value);
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const key = (module: PermissionModule, action: PermissionAction) => `${module}:${action}`;

/**
 * What one caller may do, built once per request from their roles.
 * - Grants of all roles add up. An unscoped grant covers the whole society.
 * - A grant from a role limited to a location covers only rows under that location,
 *   and only on location-bound modules; on society-wide modules it grants nothing.
 * - The protected system role (unscoped) may do everything, including modules added later.
 */
export class CallerAccess {
  readonly ability: AppAbility;
  readonly fullAccess: boolean;
  readonly grants: readonly PermissionGrant[];
  /** Per module:action, `'all'` or the scope paths a row must sit under. */
  private readonly scopes = new Map<string, 'all' | string[]>();

  constructor(rows: readonly RoleGrantRow[]) {
    this.fullAccess = rows.some((row) => row.isSystem && row.scopeLocationId === null);
    const grants: PermissionGrant[] = [];

    for (const row of rows) {
      // A scope that no longer resolves must not widen into "whole society".
      if (row.scopeLocationId !== null && row.scopePath === null) continue;
      for (const { module, action } of row.permissions) {
        if (!knownModule(module) || !knownAction(action)) continue;
        if (row.scopePath !== null && !isLocationScoped(module)) continue;
        const duplicate = grants.some(
          (grant) => grant.module === module && grant.action === action && grant.scopeLocationId === row.scopeLocationId,
        );
        if (!duplicate) grants.push({ module, action, scopeLocationId: row.scopeLocationId });
        this.addScope(key(module, action), row.scopePath);
      }
    }
    this.grants = grants;
    this.ability = this.buildAbility();
  }

  /**
   * May the caller `action` on `module`? Without a row: anywhere at all (enough for
   * the route guard). With a row of a location-bound module: on that row's location.
   */
  can(action: PermissionAction, module: PermissionModule, row?: LocatedRow): boolean {
    return row ? this.ability.can(action, subject(module, { ...row })) : this.ability.can(action, module);
  }

  /** The location paths the caller's rows must sit under, or `'all'` for the whole society. */
  paths(action: PermissionAction, module: PermissionModule): 'all' | readonly string[] {
    if (this.fullAccess) return 'all';
    return this.scopes.get(key(module, action)) ?? [];
  }

  toJSON(): Access {
    return { fullAccess: this.fullAccess, grants: [...this.grants] };
  }

  private addScope(grantKey: string, scopePath: string | null) {
    const current = this.scopes.get(grantKey);
    if (current === 'all') return;
    if (scopePath === null) this.scopes.set(grantKey, 'all');
    else this.scopes.set(grantKey, [...(current ?? []), scopePath]);
  }

  private buildAbility(): AppAbility {
    if (this.fullAccess) return createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }]);
    const rules = [...this.scopes].flatMap(([grantKey, scope]) => {
      const [module, action] = grantKey.split(':') as [PermissionModule, PermissionAction];
      if (scope === 'all') return [{ action, subject: module }];
      return scope.map((path) => ({ action, subject: module, conditions: { path: { $regex: `^${escapeRegex(path)}` } } }));
    });
    return createMongoAbility<AppAbility>(rules);
  }
}

/** Prisma `where` for rows the caller may `action` on: `{}` for all, else an OR of path prefixes (empty OR matches nothing). */
export function scopeWhere<W extends object>(
  access: CallerAccess,
  action: PermissionAction,
  module: PermissionModule,
  toWhere: (pathPrefix: string) => W,
): { OR: W[] } | Record<string, never> {
  const paths = access.paths(action, module);
  return paths === 'all' ? {} : { OR: paths.map(toWhere) };
}
