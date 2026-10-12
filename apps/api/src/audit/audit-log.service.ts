import { Injectable } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import type { AuditList, AuditListQuery, AuditOptions } from '@s57/shared';
import { PrismaService } from '../prisma/prisma.service.js';

const userName = { select: { id: true, phone: true, persons: { select: { full_name: true } } } } as const;
const nameOf = (user: { phone: string; persons: { full_name: string } | null }) => user.persons?.full_name ?? user.phone;

/** The start of a Dhaka day (UTC+6, no daylight saving) as an instant. */
const dhakaStart = (day: string) => new Date(`${day}T00:00:00+06:00`);

/** Reads `audit_logs` for the viewer (`audit.view`). Nothing here writes. */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(societyId: string, query: AuditListQuery): Promise<AuditList> {
    const { page, pageSize } = query;
    const until = query.to ? dhakaStart(query.to) : null;
    if (until) until.setUTCDate(until.getUTCDate() + 1);
    const where: Prisma.audit_logsWhereInput = {
      society_id: societyId,
      ...(query.userId ? { user_id: query.userId } : {}),
      ...(query.entityType ? { entity_type: query.entityType } : {}),
      ...(query.entityId ? { entity_id: query.entityId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.from || until ? { created_at: { ...(query.from ? { gte: dhakaStart(query.from) } : {}), ...(until ? { lt: until } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.audit_logs.findMany({
        where,
        select: {
          id: true,
          created_at: true,
          action: true,
          entity_type: true,
          entity_id: true,
          before_data: true,
          after_data: true,
          ip_address: true,
          users: userName,
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.audit_logs.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id.toString(),
        at: row.created_at.toISOString(),
        user: row.users ? { id: row.users.id, name: nameOf(row.users) } : null,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        before: row.before_data ?? null,
        after: row.after_data ?? null,
        ip: row.ip_address,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** What the filters offer: the entity types, actions and users found in this society's log. */
  async options(societyId: string): Promise<AuditOptions> {
    const [types, actions, users] = await Promise.all([
      this.prisma.audit_logs.findMany({ where: { society_id: societyId }, distinct: ['entity_type'], select: { entity_type: true } }),
      this.prisma.audit_logs.findMany({ where: { society_id: societyId }, distinct: ['action'], select: { action: true } }),
      this.prisma.users.findMany({ where: { society_id: societyId, audit_logs: { some: {} } }, select: { id: true, phone: true, persons: { select: { full_name: true } } } }),
    ]);
    return {
      entityTypes: types.map((row) => row.entity_type).sort(),
      actions: actions.map((row) => row.action).sort(),
      users: users.map((user) => ({ id: user.id, name: nameOf(user) })).sort((a, b) => a.name.localeCompare(b.name, 'bn')),
    };
  }
}
