import { SetMetadata } from '@nestjs/common';

export const AUDIT_ENTITY = 'auditEntity';
export const SKIP_AUDIT = 'skipAudit';

export type AuditTarget = { entityType: string; action?: string };

/**
 * What a write route changes, for its `audit_logs` row: `@AuditEntity('notice')`.
 * The action defaults to the method (POST create, PUT/PATCH update, DELETE delete);
 * pass one for anything else, e.g. `@AuditEntity('form_submission', 'approve')`.
 */
export const AuditEntity = (entityType: string, action?: string) =>
  SetMetadata(AUDIT_ENTITY, { entityType, action } satisfies AuditTarget);

/**
 * No automatic audit row: the handler records its own (with before/after data, or
 * inside its transaction), or the route is not a write of business data (login, logout).
 */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT, true);
