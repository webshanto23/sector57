import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { mergeMap, type Observable } from 'rxjs';
import { AUDIT_ENTITY, SKIP_AUDIT, type AuditTarget } from './audit.decorators.js';
import { AuditService } from './audit.service.js';

const METHOD_ACTIONS: Record<string, string> = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Global: every successful POST, PUT, PATCH or DELETE by a logged-in user leaves an
 * `audit_logs` row (who, from where, what, which id). Handlers that need before/after
 * data record it themselves through `AuditService` and mark the route `@SkipAudit()`.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = METHOD_ACTIONS[request.method];
    const targets = [context.getHandler(), context.getClass()];
    if (!method || this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT, targets)) return next.handle();

    const target = this.reflector.getAllAndOverride<AuditTarget | undefined>(AUDIT_ENTITY, targets);
    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        // Writes without a login (public forms) are recorded by their own handlers.
        if (!request.auth) return body;
        // The write has already happened; a failed audit insert is logged, not turned into an error.
        await this.audit.recordQuietly({
          societyId: request.auth.societyId,
          userId: request.auth.userId,
          action: target?.action ?? method,
          // Without @AuditEntity the route path still says what was touched.
          entityType: target?.entityType ?? routePath(request),
          entityId: entityId(body, request),
          ip: request.ip ?? null,
        });
        return body;
      }),
    );
  }
}

/** The id of the row written: the response's `id`, else the route's `:id`. */
function entityId(body: unknown, request: Request): string | null {
  const fromBody = body && typeof body === 'object' && 'id' in body ? (body as { id: unknown }).id : undefined;
  if (typeof fromBody === 'string' && UUID.test(fromBody)) return fromBody;
  const fromRoute = request.params?.['id'];
  return typeof fromRoute === 'string' && UUID.test(fromRoute) ? fromRoute : null;
}

function routePath(request: Request): string {
  const route = (request.route as { path?: unknown } | undefined)?.path;
  return typeof route === 'string' ? route : request.path;
}
