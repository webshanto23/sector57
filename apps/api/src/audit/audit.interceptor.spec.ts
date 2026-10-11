import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AUDIT_ENTITY, SKIP_AUDIT } from './audit.decorators.js';
import { AuditInterceptor } from './audit.interceptor.js';
import type { AuditService } from './audit.service.js';

const auth = {
  userId: '2b1f0f8e-7d5a-4c4b-9f55-8d0e0e6c1a01',
  societyId: '7e0b9a3c-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  sessionId: '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c',
};
const ROW = '5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d';

function contextFor(request: Partial<Request>, metadata: Record<string, unknown> = {}) {
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata)) Reflect.defineMetadata(key, value, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function setup() {
  const recordQuietly = vi.fn(async () => undefined);
  const interceptor = new AuditInterceptor({ recordQuietly } as unknown as AuditService, new Reflector());
  const run = (request: Partial<Request>, body: unknown, metadata?: Record<string, unknown>) =>
    lastValueFrom(interceptor.intercept(contextFor(request, metadata), { handle: () => of(body) } as CallHandler));
  return { interceptor, recordQuietly, run };
}

const write = (method: string, extra: Partial<Request> = {}) =>
  ({ method, auth, ip: '::ffff:203.0.113.5', params: {}, path: '/things', route: { path: '/things/:id' }, ...extra }) as Partial<Request>;

describe('AuditInterceptor', () => {
  it('records a write with the entity, the action from the method and the id from the body', async () => {
    const { run, recordQuietly } = setup();
    await expect(run(write('POST'), { id: ROW, name: 'x' }, { [AUDIT_ENTITY]: { entityType: 'notice' } })).resolves.toEqual({
      id: ROW,
      name: 'x',
    });
    expect(recordQuietly).toHaveBeenCalledWith({
      societyId: auth.societyId,
      userId: auth.userId,
      action: 'create',
      entityType: 'notice',
      entityId: ROW,
      ip: '::ffff:203.0.113.5',
    });
  });

  it('takes the id from the route, an explicit action, and the route path when no entity is named', async () => {
    const { run, recordQuietly } = setup();
    await run(write('PATCH', { params: { id: ROW } }), undefined, { [AUDIT_ENTITY]: { entityType: 'form', action: 'approve' } });
    expect(recordQuietly).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'approve', entityType: 'form', entityId: ROW }));

    await run(write('DELETE'), undefined);
    expect(recordQuietly).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'delete', entityType: '/things/:id', entityId: null }));
  });

  it('skips reads, @SkipAudit routes and writes without a login', async () => {
    const { run, recordQuietly } = setup();
    await run(write('GET'), { id: ROW });
    await run(write('POST'), { id: ROW }, { [SKIP_AUDIT]: true });
    await run(write('POST', { auth: undefined }), { id: ROW });
    expect(recordQuietly).not.toHaveBeenCalled();
  });

  it('records nothing when the handler fails', async () => {
    const { interceptor, recordQuietly } = setup();
    const failing = { handle: () => throwError(() => new Error('boom')) } as CallHandler;
    await expect(lastValueFrom(interceptor.intercept(contextFor(write('POST')), failing))).rejects.toThrow('boom');
    expect(recordQuietly).not.toHaveBeenCalled();
  });
});
