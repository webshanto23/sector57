import { isLocationScoped, isUnderPath, PERMISSION_ACTIONS, PERMISSION_MODULES, type PermissionRef } from '@s57/shared';
import type { CallerAccess } from './caller-access.js';

/** A role given (or to be given) to a user, as far as the escalation check needs it. */
export type AssignmentGrant = {
  isSystem: boolean;
  /** `locations.path` of the scope; null for the whole society. */
  scopePath: string | null;
  permissions: readonly { module: string; action: string }[];
};

const known = (p: { module: string; action: string }): p is PermissionRef =>
  (PERMISSION_MODULES as readonly string[]).includes(p.module) && (PERMISSION_ACTIONS as readonly string[]).includes(p.action);

/**
 * May the caller put these permissions into a role? Only those they hold for the
 * whole society: a role holder could otherwise give themselves more than they have.
 */
export function canGrantPermissions(access: CallerAccess, permissions: readonly { module: string; action: string }[]): boolean {
  if (access.fullAccess) return true;
  return permissions.every((p) => !known(p) || access.paths(p.action, p.module) === 'all');
}

/**
 * May the caller give (or take away) this role at this scope? They must hold every
 * permission it carries, over at least the same area. Grants a scoped role can't
 * carry (society-wide modules) don't count. Only full access may touch the system role.
 */
export function canAssign(access: CallerAccess, assignment: AssignmentGrant): boolean {
  if (access.fullAccess) return true;
  if (assignment.isSystem) return false;
  return assignment.permissions.every((p) => {
    if (!known(p)) return true;
    if (assignment.scopePath !== null && !isLocationScoped(p.module)) return true;
    const paths = access.paths(p.action, p.module);
    if (paths === 'all') return true;
    const scopePath = assignment.scopePath;
    return scopePath !== null && paths.some((path) => isUnderPath(scopePath, path));
  });
}

/** May the caller change a user holding these roles? Only one they could have given all of them to. */
export function canManage(access: CallerAccess, held: readonly AssignmentGrant[]): boolean {
  return held.every((assignment) => canAssign(access, assignment));
}
