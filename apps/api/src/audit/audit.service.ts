import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import { PrismaService } from '../prisma/prisma.service.js';

export type AuditEntry = {
  societyId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string | null;
};

/** Writes `audit_logs` rows. Never pass passwords, tokens or hashes in `before`/`after`. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, client: Pick<PrismaService, 'audit_logs'> = this.prisma): Promise<void> {
    await client.audit_logs.create({
      data: {
        society_id: entry.societyId,
        user_id: entry.userId ?? null,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId ?? null,
        before_data: entry.before,
        after_data: entry.after,
        ip_address: toInet(entry.ip),
      },
    });
  }

  /** For events that must not fail the request because the audit insert failed (a failed login). */
  async recordQuietly(entry: AuditEntry): Promise<void> {
    try {
      await this.record(entry);
    } catch (error) {
      this.logger.error({ err: error, action: entry.action }, 'Could not write audit log');
    }
  }
}

/** Express gives IPv4 clients as `::ffff:1.2.3.4`; store the plain address. Anything else unparseable is dropped. */
export function toInet(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const plain = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return /^[0-9a-f.:]+$/i.test(plain) ? plain : null;
}
