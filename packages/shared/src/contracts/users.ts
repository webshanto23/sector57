import { z } from 'zod';
import { LOCALES } from '../locale.js';
import { bdPhone, optionalEmail, optionalText, pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';

/** `users.status`. `invited` is unused until invites by SMS or email exist. */
export const USER_STATUSES = ['invited', 'active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const toUserStatus = (value: string): UserStatus =>
  (USER_STATUSES as readonly string[]).includes(value) ? (value as UserStatus) : 'disabled';

/** A role given to a user: `scopeLocationId` null means the whole society. */
export const roleAssignmentSchema = z.object({
  roleId: z.uuid(),
  scopeLocationId: z.uuid().nullable(),
});
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;

/** A user's role as shown in lists and on the details page. */
export const userRoleSchema = roleAssignmentSchema.extend({
  roleName: z.string(),
  isSystem: z.boolean(),
  /** Name of the scope location, null for the whole society. */
  scopeName: z.string().nullable(),
});
export type UserRole = z.infer<typeof userRoleSchema>;

/** One user in the list. Names come from the linked `persons` row. */
export const userSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  nameEn: z.string().nullable(),
  phone: z.string(),
  email: z.string().nullable(),
  status: z.enum(USER_STATUSES),
  language: z.enum(LOCALES),
  lastLoginAt: z.iso.datetime({ offset: true }).nullable(),
  /** Set while too many wrong passwords keep the account locked. */
  lockedUntil: z.iso.datetime({ offset: true }).nullable(),
  roles: z.array(userRoleSchema),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

/** `GET /users/:id`. */
export const userDetailSchema = userSummarySchema.extend({
  createdAt: z.iso.datetime({ offset: true }),
  /** The caller's own account: status, roles and password reset are not available on it. */
  isSelf: z.boolean(),
  /**
   * May the caller change this user? Only when the caller holds everything the user
   * holds (a system role holder only by another one). The API checks the same rule.
   */
  canManage: z.boolean(),
});
export type UserDetail = z.infer<typeof userDetailSchema>;

/** `GET /users` query. `q` matches name (Bangla or English) or phone. */
export const userListQuery = pagination.extend({
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  status: z.enum(USER_STATUSES).optional(),
  roleId: z.uuid().optional(),
});
export type UserListQuery = z.infer<typeof userListQuery>;

/** `GET /users` response. */
export const userListSchema = z.object({
  items: z.array(userSummarySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type UserList = z.infer<typeof userListSchema>;

const MAX_ASSIGNMENTS = 20;
const assignments = z.array(roleAssignmentSchema).max(MAX_ASSIGNMENTS);

/** `POST /users`: the office creates the account; the API answers with a temporary password. */
export const createUserSchema = z.object({
  name: text(200),
  nameEn: optionalText(200),
  phone: bdPhone,
  email: optionalEmail,
  language: z.enum(LOCALES).default('bn'),
  roles: assignments.default([]),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** `POST /users` response: shown once, never stored in plain text. */
export const createdUserSchema = z.object({
  id: z.uuid(),
  temporaryPassword: z.string(),
});
export type CreatedUser = z.infer<typeof createdUserSchema>;

/** `PATCH /users/:id`. Only the fields sent are changed. The names are stored on the linked `persons` row. */
export const updateUserSchema = z.object({
  name: text(200).optional(),
  nameEn: optionalText(200).optional(),
  email: optionalEmail.optional(),
  language: z.enum(LOCALES).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** `PUT /users/:id/roles`: the user's whole role list. */
export const setUserRolesSchema = z.object({ roles: assignments });
export type SetUserRolesInput = z.infer<typeof setUserRolesSchema>;

/** `POST /users/:id/reset-password` response. */
export const passwordResetSchema = z.object({ temporaryPassword: z.string() });
export type PasswordReset = z.infer<typeof passwordResetSchema>;

/** A role the caller may pick on the user form. */
export const roleOptionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isSystem: z.boolean(),
  /** False when the caller may not give this role for the whole society. */
  grantable: z.boolean(),
});

/** A location a role can be limited to (unit-level locations are left out). */
export const scopeOptionSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  name: z.string(),
  levelBn: z.string(),
  levelEn: z.string().nullable(),
  depth: z.number().int(),
});
export type ScopeOption = z.infer<typeof scopeOptionSchema>;

/** `GET /users/options`: what the user form's role and area pickers offer. */
export const userFormOptionsSchema = z.object({
  roles: z.array(roleOptionSchema),
  scopes: z.array(scopeOptionSchema),
});
export type UserFormOptions = z.infer<typeof userFormOptionsSchema>;
