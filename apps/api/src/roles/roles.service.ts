import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PermissionRef, RoleDetail, RoleInput, RoleList, RoleSummary } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { canGrantPermissions } from '../permissions/grant-limits.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

const select = {
  id: true,
  name: true,
  description: true,
  is_system: true,
  _count: { select: { user_roles: true, role_permissions: true } },
} as const;

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  _count: { user_roles: number; role_permissions: number };
};

const toSummary = (row: RoleRow): RoleSummary => ({
  id: row.id,
  name: row.name,
  description: row.description,
  isSystem: row.is_system,
  userCount: row._count.user_roles,
  permissionCount: row._count.role_permissions,
});

const refKey = (p: { module: string; action: string }) => `${p.module}:${p.action}`;

const notFound = () => new NotFoundException({ code: 'role_not_found', message: 'Role not found' });
const protectedRole = () =>
  new ForbiddenException({ code: 'system_role_protected', message: 'The system role cannot be changed' });
const beyondCaller = () =>
  new ForbiddenException({ code: 'beyond_your_permissions', message: 'You can only grant permissions you hold yourself' });
const nameTaken = () => new ConflictException({ code: 'role_name_taken', message: 'A role with this name already exists' });

/**
 * Roles and their permission matrix. A caller can only put into a role (or take out
 * of it) permissions they hold for the whole society; the system role is read-only.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(societyId: string): Promise<RoleList> {
    const rows = await this.prisma.roles.findMany({
      where: { society_id: societyId },
      select,
      orderBy: [{ is_system: 'desc' }, { name: 'asc' }],
    });
    return { items: rows.map(toSummary) };
  }

  async get(societyId: string, id: string): Promise<RoleDetail> {
    const row = await this.prisma.roles.findFirst({
      where: { id, society_id: societyId },
      select: { ...select, role_permissions: { select: { permissions: { select: { module: true, action: true } } } } },
    });
    if (!row) throw notFound();
    return { ...toSummary(row), permissions: row.role_permissions.map((rp) => rp.permissions as PermissionRef) };
  }

  async create(actor: Actor, input: RoleInput): Promise<RoleDetail> {
    const permissions = dedupe(input.permissions);
    if (!canGrantPermissions(actor.access, permissions)) throw beyondCaller();
    const permissionIds = await this.permissionIds(permissions);

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const role = await tx.roles.create({
          data: { society_id: actor.societyId, name: input.name, description: input.description },
          select: { id: true },
        });
        await tx.role_permissions.createMany({ data: permissionIds.map((permission_id) => ({ role_id: role.id, permission_id })) });
        await this.audit.record(
          {
            societyId: actor.societyId,
            userId: actor.userId,
            action: 'create',
            entityType: 'role',
            entityId: role.id,
            after: { name: input.name, description: input.description, permissions: permissions.map(refKey) },
            ip: actor.ip,
          },
          tx,
        );
        return role.id;
      });
      return this.get(actor.societyId, id);
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
  }

  /** Replaces the name, description and matrix. The caller must hold both the old and the new permissions. */
  async update(actor: Actor, id: string, input: RoleInput): Promise<RoleDetail> {
    const before = await this.get(actor.societyId, id);
    if (before.isSystem) throw protectedRole();
    const permissions = dedupe(input.permissions);
    if (!canGrantPermissions(actor.access, [...before.permissions, ...permissions])) throw beyondCaller();
    const permissionIds = await this.permissionIds(permissions);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.roles.update({ where: { id }, data: { name: input.name, description: input.description } });
        await tx.role_permissions.deleteMany({ where: { role_id: id } });
        await tx.role_permissions.createMany({ data: permissionIds.map((permission_id) => ({ role_id: id, permission_id })) });
        await this.audit.record(
          {
            societyId: actor.societyId,
            userId: actor.userId,
            action: 'update',
            entityType: 'role',
            entityId: id,
            before: { name: before.name, description: before.description, permissions: before.permissions.map(refKey) },
            after: { name: input.name, description: input.description, permissions: permissions.map(refKey) },
            ip: actor.ip,
          },
          tx,
        );
      });
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
    return this.get(actor.societyId, id);
  }

  /** Only a role nobody holds can be deleted (409 `role_in_use` otherwise). */
  async remove(actor: Actor, id: string): Promise<void> {
    const before = await this.get(actor.societyId, id);
    if (before.isSystem) throw protectedRole();
    if (!canGrantPermissions(actor.access, before.permissions)) throw beyondCaller();

    await this.prisma.$transaction(async (tx) => {
      // Checked inside the transaction so a grant made meanwhile isn't cascaded away.
      if ((await tx.user_roles.count({ where: { role_id: id } })) > 0) {
        throw new ConflictException({ code: 'role_in_use', message: 'Remove this role from its users first' });
      }
      await tx.roles.delete({ where: { id } });
      await this.audit.record(
        {
          societyId: actor.societyId,
          userId: actor.userId,
          action: 'delete',
          entityType: 'role',
          entityId: id,
          before: { name: before.name, description: before.description, permissions: before.permissions.map(refKey) },
          ip: actor.ip,
        },
        tx,
      );
    });
  }

  private async permissionIds(permissions: PermissionRef[]): Promise<string[]> {
    if (permissions.length === 0) return [];
    const rows = await this.prisma.permissions.findMany({
      where: { OR: permissions.map(({ module, action }) => ({ module, action })) },
      select: { id: true },
    });
    // The seed creates the whole catalogue; a missing row means the database is behind the code.
    if (rows.length !== permissions.length) throw new Error('Permission catalogue is incomplete; run the seed');
    return rows.map((row) => row.id);
  }
}

function dedupe(permissions: PermissionRef[]): PermissionRef[] {
  const seen = new Map(permissions.map((p) => [refKey(p), p]));
  return [...seen.values()];
}
