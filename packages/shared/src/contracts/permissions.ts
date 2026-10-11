import { z } from 'zod';

/**
 * The permission catalogue: every module × action pair is one `permissions` row
 * (seeded by `packages/db/prisma/seed.ts`, which must list the same names).
 * Roles are data: they get any subset of these from the dashboard. Code checks
 * these permissions, never a role name.
 */
export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'approve', 'delete', 'export'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_MODULES = [
  'settings',
  'users',
  'roles',
  'locations',
  'units',
  'members',
  'ownerships',
  'tenancies',
  'committee',
  'notices',
  'documents',
  'forms',
  'site',
  'gallery',
  'billing',
  'payments',
  'donations',
  'expenses',
  'budgets',
  'ledger',
  'audit',
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

/**
 * Modules whose rows sit somewhere in the location tree. Only these respect a
 * role's area scope; a role limited to one block grants nothing on the other
 * (society-wide) modules, so a block manager can't edit every notice.
 */
export const LOCATION_SCOPED_MODULES = [
  'locations',
  'units',
  'members',
  'ownerships',
  'tenancies',
  'forms',
  'billing',
  'payments',
] as const satisfies readonly PermissionModule[];

export const isLocationScoped = (module: PermissionModule): boolean =>
  (LOCATION_SCOPED_MODULES as readonly PermissionModule[]).includes(module);

/**
 * `locations.path`: the ids from the root down to the location itself, each
 * followed by `/`, e.g. `/<sector>/<block>/<road>/`. The trailing slash keeps
 * prefix checks exact: a location is inside a scope when its path starts with
 * the scope's path.
 */
export const locationPath = (parentPath: string | null, id: string): string => `${parentPath ?? '/'}${id}/`;

export const isUnderPath = (path: string, scopePath: string): boolean => path.startsWith(scopePath);

/** One grant of the caller: `scopeLocationId` null means the whole society. */
export const permissionGrantSchema = z.object({
  module: z.enum(PERMISSION_MODULES),
  action: z.enum(PERMISSION_ACTIONS),
  scopeLocationId: z.uuid().nullable(),
});
export type PermissionGrant = z.infer<typeof permissionGrantSchema>;

/** What the caller may do, for the web app to show or hide things. The API still checks every request. */
export const accessSchema = z.object({
  /** Holder of the protected system role: everything, including modules added later. */
  fullAccess: z.boolean(),
  grants: z.array(permissionGrantSchema),
});
export type Access = z.infer<typeof accessSchema>;

/** True when the caller may `action` on `module` anywhere (in the whole society or in some area). */
export const canAnywhere = (access: Access, module: PermissionModule, action: PermissionAction = 'view'): boolean =>
  access.fullAccess || access.grants.some((grant) => grant.module === module && grant.action === action);

/** True when the caller may `action` on `module` for the whole society, not just in an area. */
export const canSocietyWide = (access: Access, module: PermissionModule, action: PermissionAction = 'view'): boolean =>
  access.fullAccess ||
  access.grants.some((grant) => grant.module === module && grant.action === action && grant.scopeLocationId === null);
