import { z } from 'zod';
import { optionalText, text } from '../schemas.js';
import { canSocietyWide, PERMISSION_ACTIONS, PERMISSION_MODULES, type Access, type PermissionAction, type PermissionModule } from './permissions.js';

/** One cell of the permission matrix. */
export const permissionRefSchema = z.object({
  module: z.enum(PERMISSION_MODULES),
  action: z.enum(PERMISSION_ACTIONS),
});
export type PermissionRef = z.infer<typeof permissionRefSchema>;

/** One role in the list. */
export const roleSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  /** The protected role with full access: it can't be edited or deleted. */
  isSystem: z.boolean(),
  /** Users holding the role (any scope, any status). */
  userCount: z.number().int().min(0),
  permissionCount: z.number().int().min(0),
});
export type RoleSummary = z.infer<typeof roleSummarySchema>;

/** `GET /roles`. Not paged: a society has a handful of roles. */
export const roleListSchema = z.object({ items: z.array(roleSummarySchema) });
export type RoleList = z.infer<typeof roleListSchema>;

/** `GET /roles/:id`. */
export const roleDetailSchema = roleSummarySchema.extend({ permissions: z.array(permissionRefSchema) });
export type RoleDetail = z.infer<typeof roleDetailSchema>;

const MATRIX_SIZE = PERMISSION_MODULES.length * PERMISSION_ACTIONS.length;

/** `POST /roles` and `PUT /roles/:id`: the whole role, the matrix as a list of ticked cells. */
export const roleInputSchema = z.object({
  name: text(100),
  description: optionalText(300),
  permissions: z.array(permissionRefSchema).max(MATRIX_SIZE),
});
export type RoleInput = z.infer<typeof roleInputSchema>;

/**
 * May the caller put this permission into a role? Only what they hold for the whole
 * society (or everything, with full access). The API checks the same rule.
 */
export const canGrant = (access: Access, module: PermissionModule, action: PermissionAction): boolean =>
  canSocietyWide(access, module, action);
