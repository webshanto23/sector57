import { z } from 'zod';
import { pagination } from '../schemas.js';
import { cleanText } from '../text.js';
import { isoDay } from './members.js';

/**
 * The audit log viewer (`audit.view`, society-wide, read-only). Rows are written from
 * Step 4 on by `AuditService` and the global audit interceptor; they never hold passwords,
 * tokens or NIDs.
 */
export const auditListQuery = pagination.extend({
  userId: z.uuid().optional(),
  entityType: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  entityId: z.uuid().optional(),
  action: z.string().transform(cleanText).pipe(z.string().max(50)).optional(),
  /** Dhaka days, both included. */
  from: isoDay.optional(),
  to: isoDay.optional(),
});
export type AuditListQuery = z.infer<typeof auditListQuery>;

export const auditRowSchema = z.object({
  /** `audit_logs.id` (a bigint), as text. */
  id: z.string(),
  at: z.iso.datetime({ offset: true }),
  user: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.uuid().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  ip: z.string().nullable(),
});
export type AuditRow = z.infer<typeof auditRowSchema>;

export const auditListSchema = z.object({
  items: z.array(auditRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type AuditList = z.infer<typeof auditListSchema>;

/** `GET /audit/options`: what the filters offer. */
export const auditOptionsSchema = z.object({
  entityTypes: z.array(z.string()),
  actions: z.array(z.string()),
  users: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type AuditOptions = z.infer<typeof auditOptionsSchema>;
