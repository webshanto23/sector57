import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import {
  asciiDigits,
  isLocale,
  toUserStatus,
  type CreatedUser,
  type CreateUserInput,
  type PasswordReset,
  type RoleAssignment,
  type UpdateUserInput,
  type UserDetail,
  type UserFormOptions,
  type UserList,
  type UserListQuery,
  type UserSummary,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionsService } from '../auth/sessions.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { canAssign, canManage, type AssignmentGrant } from '../permissions/grant-limits.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;

const summarySelect = {
  id: true,
  phone: true,
  email: true,
  status: true,
  language: true,
  last_login_at: true,
  locked_until: true,
  created_at: true,
  persons: { select: { full_name: true, full_name_en: true } },
  user_roles_user_roles_user_idTousers: {
    select: {
      role_id: true,
      scope_location_id: true,
      roles: { select: { name: true, is_system: true } },
      locations: { select: { name: true } },
    },
    orderBy: { granted_at: 'asc' },
  },
} as const satisfies Prisma.usersSelect;

type SummaryRow = Prisma.usersGetPayload<{ select: typeof summarySelect }>;

function toSummary(row: SummaryRow, now: Date): UserSummary {
  return {
    id: row.id,
    name: row.persons?.full_name ?? null,
    nameEn: row.persons?.full_name_en ?? null,
    phone: row.phone,
    email: row.email,
    status: toUserStatus(row.status),
    language: isLocale(row.language) ? row.language : 'bn',
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    lockedUntil: row.locked_until && row.locked_until > now ? row.locked_until.toISOString() : null,
    roles: row.user_roles_user_roles_user_idTousers.map((ur) => ({
      roleId: ur.role_id,
      scopeLocationId: ur.scope_location_id,
      roleName: ur.roles.name,
      isSystem: ur.roles.is_system,
      scopeName: ur.locations?.name ?? null,
    })),
  };
}

/** A role assignment with what the escalation check needs. */
type ResolvedAssignment = RoleAssignment & AssignmentGrant;

const assignmentKey = (a: RoleAssignment) => `${a.roleId}:${a.scopeLocationId ?? '*'}`;

const notFound = () => new NotFoundException({ code: 'user_not_found', message: 'User not found' });
const beyondCaller = () =>
  new ForbiddenException({ code: 'beyond_your_permissions', message: 'This needs permissions you do not hold' });
const notSelf = () =>
  new ForbiddenException({ code: 'cannot_change_self', message: 'You cannot change your own roles, status or password here' });

/**
 * Dashboard users. Rules (also in `docs/steps.md`, Step 6):
 * - A caller changes only users whose roles they could have given themselves, and
 *   gives only roles whose permissions they hold over the same area.
 * - Nobody changes their own status or roles, or resets their own password here.
 * - The last active holder of the system role keeps it and stays active.
 * - Users are never deleted, only disabled; disabling logs them out everywhere.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
  ) {}

  async list(societyId: string, query: UserListQuery, now = new Date()): Promise<UserList> {
    const { page, pageSize, q, status, roleId } = query;
    const phoneDigits = q ? asciiDigits(q).replace(/[\s-]/g, '') : '';
    const where: Prisma.usersWhereInput = {
      society_id: societyId,
      ...(status ? { status } : {}),
      ...(roleId ? { user_roles_user_roles_user_idTousers: { some: { role_id: roleId } } } : {}),
      ...(q
        ? {
            OR: [
              { persons: { full_name: { contains: q, mode: 'insensitive' } } },
              { persons: { full_name_en: { contains: q, mode: 'insensitive' } } },
              ...(/^\d+$/.test(phoneDigits) ? [{ phone: { contains: phoneDigits } }] : []),
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.users.count({ where }),
      this.prisma.users.findMany({
        where,
        select: summarySelect,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map((row) => toSummary(row, now)), total, page, pageSize };
  }

  async get(actor: Actor, id: string, now = new Date()): Promise<UserDetail> {
    const row = await this.prisma.users.findFirst({ where: { id, society_id: actor.societyId }, select: summarySelect });
    if (!row) throw notFound();
    const isSelf = row.id === actor.userId;
    return {
      ...toSummary(row, now),
      createdAt: row.created_at.toISOString(),
      isSelf,
      canManage: !isSelf && canManage(actor.access, await this.held(actor.societyId, id)),
    };
  }

  /** The roles and areas the user form offers. */
  async options(actor: Actor): Promise<UserFormOptions> {
    const [roles, scopes] = await Promise.all([
      this.prisma.roles.findMany({
        where: { society_id: actor.societyId },
        select: { id: true, name: true, is_system: true, role_permissions: { select: { permissions: true } } },
        orderBy: [{ is_system: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.locations.findMany({
        where: { society_id: actor.societyId, is_active: true, location_levels: { is_unit_level: false } },
        select: { id: true, parent_id: true, name: true, location_levels: { select: { name_bn: true, name_en: true, depth: true } } },
        orderBy: [{ location_levels: { depth: 'asc' } }, { name: 'asc' }],
      }),
    ]);
    return {
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        isSystem: role.is_system,
        grantable: canAssign(actor.access, {
          isSystem: role.is_system,
          scopePath: null,
          permissions: role.role_permissions.map((rp) => rp.permissions),
        }),
      })),
      scopes: scopes.map((location) => ({
        id: location.id,
        parentId: location.parent_id,
        name: location.name,
        levelBn: location.location_levels.name_bn,
        levelEn: location.location_levels.name_en,
        depth: location.location_levels.depth,
      })),
    };
  }

  /** A new active account with a random password, shown once. The person with this phone is reused if there is one. */
  async create(actor: Actor, input: CreateUserInput): Promise<CreatedUser> {
    const assignments = await this.resolve(actor.societyId, input.roles);
    if (!assignments.every((a) => canAssign(actor.access, a))) throw beyondCaller();

    const temporaryPassword = this.passwords.random();
    const passwordHash = await this.passwords.hash(temporaryPassword);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const person =
          (await tx.persons.findUnique({
            where: { society_id_phone: { society_id: actor.societyId, phone: input.phone } },
            select: { id: true },
          })) ??
          (await tx.persons.create({
            data: { society_id: actor.societyId, full_name: input.name, full_name_en: input.nameEn, phone: input.phone },
            select: { id: true },
          }));
        const user = await tx.users.create({
          data: {
            society_id: actor.societyId,
            person_id: person.id,
            phone: input.phone,
            email: input.email,
            language: input.language,
            password_hash: passwordHash,
            status: 'active',
          },
          select: { id: true },
        });
        await tx.user_roles.createMany({
          data: assignments.map((a) => ({
            user_id: user.id,
            role_id: a.roleId,
            scope_location_id: a.scopeLocationId,
            granted_by: actor.userId,
          })),
        });
        await this.audit.record(
          {
            societyId: actor.societyId,
            userId: actor.userId,
            action: 'create',
            entityType: 'user',
            entityId: user.id,
            after: { phone: input.phone, language: input.language, roles: assignments.map(assignmentKey) },
            ip: actor.ip,
          },
          tx,
        );
        return user.id;
      });
      return { id, temporaryPassword };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({ code: 'phone_taken', message: 'A user with this phone already exists' });
      }
      throw error;
    }
  }

  /** Profile fields (name, email, language) and status. Callers may edit their own profile, not their own status. */
  async update(actor: Actor, id: string, input: UpdateUserInput): Promise<UserDetail> {
    const user = await this.prisma.users.findFirst({
      where: { id, society_id: actor.societyId },
      select: { id: true, phone: true, email: true, language: true, status: true, person_id: true, persons: true },
    });
    if (!user) throw notFound();
    const isSelf = user.id === actor.userId;
    if (isSelf && input.status !== undefined) throw notSelf();
    if (!isSelf && !canManage(actor.access, await this.held(actor.societyId, id))) throw beyondCaller();

    const disabling = input.status === 'disabled' && user.status !== 'disabled';
    const personChanges = {
      ...(input.name !== undefined ? { full_name: input.name } : {}),
      ...(input.nameEn !== undefined ? { full_name_en: input.nameEn } : {}),
    };
    const userChanges = {
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };

    await this.prisma.$transaction(async (tx) => {
      if (disabling) await this.assertAnotherAdmin(tx, actor.societyId, id);
      if (Object.keys(personChanges).length > 0) {
        if (user.person_id) {
          await tx.persons.update({ where: { id: user.person_id }, data: personChanges });
        } else if (input.name !== undefined) {
          // Accounts made outside the dashboard may have no person yet.
          const person = await tx.persons.create({
            data: { society_id: actor.societyId, full_name: input.name, full_name_en: input.nameEn ?? null },
            select: { id: true },
          });
          await tx.users.update({ where: { id }, data: { person_id: person.id } });
        }
      }
      if (Object.keys(userChanges).length > 0) await tx.users.update({ where: { id }, data: userChanges });
      await this.audit.record(
        {
          societyId: actor.societyId,
          userId: actor.userId,
          action: disabling ? 'disable' : input.status === 'active' && user.status !== 'active' ? 'enable' : 'update',
          entityType: 'user',
          entityId: id,
          before: {
            fullName: user.persons?.full_name ?? null,
            fullNameEn: user.persons?.full_name_en ?? null,
            email: user.email,
            language: user.language,
            status: user.status,
          },
          after: { ...personChanges, ...userChanges },
          ip: actor.ip,
        },
        tx,
      );
    });
    // Access tokens stop working at once (the permission check reads the status); refresh tokens are revoked here.
    if (disabling) await this.sessions.revokeAllForUser(id);
    return this.get(actor, id);
  }

  /** Replaces the user's roles. Unchanged rows are kept, so their grant date and granter stay. */
  async setRoles(actor: Actor, id: string, roles: RoleAssignment[]): Promise<UserDetail> {
    if (id === actor.userId) throw notSelf();
    const exists = await this.prisma.users.findFirst({ where: { id, society_id: actor.societyId }, select: { id: true } });
    if (!exists) throw notFound();

    const current = await this.held(actor.societyId, id);
    if (!canManage(actor.access, current)) throw beyondCaller();
    const next = await this.resolve(actor.societyId, roles);
    const nextKeys = new Set(next.map(assignmentKey));
    const currentKeys = new Set(current.map(assignmentKey));
    const added = next.filter((a) => !currentKeys.has(assignmentKey(a)));
    const removed = current.filter((a) => !nextKeys.has(assignmentKey(a)));
    if (!added.every((a) => canAssign(actor.access, a))) throw beyondCaller();

    await this.prisma.$transaction(async (tx) => {
      if (removed.some((a) => a.isSystem && a.scopeLocationId === null)) await this.assertAnotherAdmin(tx, actor.societyId, id);
      for (const a of removed) {
        await tx.user_roles.deleteMany({ where: { user_id: id, role_id: a.roleId, scope_location_id: a.scopeLocationId } });
      }
      await tx.user_roles.createMany({
        data: added.map((a) => ({ user_id: id, role_id: a.roleId, scope_location_id: a.scopeLocationId, granted_by: actor.userId })),
      });
      await this.audit.record(
        {
          societyId: actor.societyId,
          userId: actor.userId,
          action: 'update_roles',
          entityType: 'user',
          entityId: id,
          before: { roles: current.map(assignmentKey) },
          after: { roles: next.map(assignmentKey) },
          ip: actor.ip,
        },
        tx,
      );
    });
    return this.get(actor, id);
  }

  /** A random password, shown once; the user is logged out everywhere. `AuthService` writes the audit row. */
  async resetPassword(actor: Actor, id: string): Promise<PasswordReset> {
    if (id === actor.userId) throw notSelf();
    const exists = await this.prisma.users.findFirst({ where: { id, society_id: actor.societyId }, select: { id: true } });
    if (!exists) throw notFound();
    if (!canManage(actor.access, await this.held(actor.societyId, id))) throw beyondCaller();
    const temporaryPassword = await this.auth.resetPassword(actor.societyId, id, actor.userId, { ip: actor.ip });
    return { temporaryPassword };
  }

  /** The user's current roles, with their permissions and scope paths. */
  private async held(societyId: string, userId: string): Promise<ResolvedAssignment[]> {
    const rows = await this.prisma.user_roles.findMany({
      where: { user_id: userId },
      select: {
        role_id: true,
        scope_location_id: true,
        roles: { select: { society_id: true, is_system: true, role_permissions: { select: { permissions: true } } } },
        locations: { select: { path: true, society_id: true } },
      },
    });
    return rows.map((row) => {
      // A role or scope from another society grants nothing (the same rule as `AbilityService`).
      const foreign =
        row.roles.society_id !== societyId || (row.locations !== null && row.locations.society_id !== societyId);
      return {
        roleId: row.role_id,
        scopeLocationId: row.scope_location_id,
        isSystem: !foreign && row.roles.is_system,
        scopePath: row.locations?.path ?? null,
        permissions: foreign ? [] : row.roles.role_permissions.map((rp) => rp.permissions),
      };
    });
  }

  /** Looks up the roles and scopes of an assignment list; anything not in this society is a 400. */
  private async resolve(societyId: string, input: RoleAssignment[]): Promise<ResolvedAssignment[]> {
    const unique = [...new Map(input.map((a) => [assignmentKey(a), a])).values()];
    const roleIds = [...new Set(unique.map((a) => a.roleId))];
    const scopeIds = [...new Set(unique.flatMap((a) => (a.scopeLocationId ? [a.scopeLocationId] : [])))];
    const [roles, scopes] = await Promise.all([
      this.prisma.roles.findMany({
        where: { id: { in: roleIds }, society_id: societyId },
        select: { id: true, is_system: true, role_permissions: { select: { permissions: true } } },
      }),
      this.prisma.locations.findMany({ where: { id: { in: scopeIds }, society_id: societyId }, select: { id: true, path: true } }),
    ]);
    const roleById = new Map(roles.map((role) => [role.id, role]));
    const pathById = new Map(scopes.map((scope) => [scope.id, scope.path]));

    return unique.map((a) => {
      const role = roleById.get(a.roleId);
      const scopePath = a.scopeLocationId ? pathById.get(a.scopeLocationId) : null;
      if (!role || scopePath === undefined) {
        throw new BadRequestException({ code: 'invalid_assignment', message: 'Unknown role or area' });
      }
      return {
        ...a,
        isSystem: role.is_system,
        scopePath,
        permissions: role.role_permissions.map((rp) => rp.permissions),
      };
    });
  }

  /** 409 `last_admin` unless another active user holds the system role for the whole society. */
  private async assertAnotherAdmin(tx: Tx, societyId: string, userId: string): Promise<void> {
    const others = await tx.user_roles.count({
      where: {
        user_id: { not: userId },
        scope_location_id: null,
        roles: { society_id: societyId, is_system: true },
        users_user_roles_user_idTousers: { society_id: societyId, status: 'active' },
      },
    });
    if (others === 0) {
      throw new ConflictException({ code: 'last_admin', message: 'At least one active user must keep full access' });
    }
  }
}
