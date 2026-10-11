import { locationPath } from '@s57/shared';
import { CallerAccess, scopeWhere, type RoleGrantRow } from './caller-access.js';

const SECTOR = locationPath(null, '11111111-1111-4111-8111-111111111111');
const BLOCK_C = locationPath(SECTOR, '22222222-2222-4222-8222-222222222222');
const BLOCK_D = locationPath(SECTOR, '33333333-3333-4333-8333-333333333333');
const ROAD_C9 = locationPath(BLOCK_C, '44444444-4444-4444-8444-444444444444');
const BLOCK_C_ID = '22222222-2222-4222-8222-222222222222';
const BLOCK_D_ID = '33333333-3333-4333-8333-333333333333';

const role = (permissions: string[], scope: { id: string; path: string } | null = null, isSystem = false): RoleGrantRow => ({
  isSystem,
  scopeLocationId: scope?.id ?? null,
  scopePath: scope?.path ?? null,
  permissions: permissions.map((p) => {
    const [module, action] = p.split(':');
    return { module: module!, action: action! };
  }),
});

const blockC = { id: BLOCK_C_ID, path: BLOCK_C };
const blockD = { id: BLOCK_D_ID, path: BLOCK_D };

describe('CallerAccess', () => {
  it('denies everything without roles', () => {
    const access = new CallerAccess([]);
    expect(access.can('view', 'members')).toBe(false);
    expect(access.paths('view', 'members')).toEqual([]);
    expect(access.toJSON()).toEqual({ fullAccess: false, grants: [] });
  });

  it('gives the unscoped system role everything', () => {
    const access = new CallerAccess([role([], null, true)]);
    expect(access.fullAccess).toBe(true);
    expect(access.can('delete', 'audit')).toBe(true);
    expect(access.can('edit', 'members', { path: BLOCK_D })).toBe(true);
    expect(access.paths('view', 'members')).toBe('all');
  });

  it('treats a scoped system role as its permissions in that area only', () => {
    const access = new CallerAccess([role(['members:view'], blockC, true)]);
    expect(access.fullAccess).toBe(false);
    expect(access.can('view', 'members', { path: BLOCK_D })).toBe(false);
  });

  it('allows unscoped grants on every row, and only the granted actions', () => {
    const access = new CallerAccess([role(['members:view', 'notices:edit'])]);
    expect(access.can('view', 'members', { path: BLOCK_D })).toBe(true);
    expect(access.can('edit', 'members')).toBe(false);
    expect(access.can('edit', 'notices')).toBe(true);
    expect(access.paths('view', 'members')).toBe('all');
  });

  it('limits a scoped grant to rows under its location', () => {
    const access = new CallerAccess([role(['members:view'], blockC)]);
    expect(access.can('view', 'members')).toBe(true);
    expect(access.can('view', 'members', { path: BLOCK_C })).toBe(true);
    expect(access.can('view', 'members', { path: ROAD_C9 })).toBe(true);
    expect(access.can('view', 'members', { path: BLOCK_D })).toBe(false);
    expect(access.can('view', 'members', { path: SECTOR })).toBe(false);
    expect(access.paths('view', 'members')).toEqual([BLOCK_C]);
  });

  it('gives a scoped role nothing on society-wide modules', () => {
    const access = new CallerAccess([role(['notices:edit', 'roles:view', 'members:view'], blockC)]);
    expect(access.can('edit', 'notices')).toBe(false);
    expect(access.can('view', 'roles')).toBe(false);
    expect(access.toJSON().grants).toEqual([{ module: 'members', action: 'view', scopeLocationId: BLOCK_C_ID }]);
  });

  it('adds up roles: two areas, and an unscoped grant wins over scoped ones', () => {
    const twoBlocks = new CallerAccess([role(['members:view'], blockC), role(['members:view'], blockD)]);
    expect(twoBlocks.paths('view', 'members')).toEqual([BLOCK_C, BLOCK_D]);
    expect(twoBlocks.can('view', 'members', { path: BLOCK_D })).toBe(true);

    const wide = new CallerAccess([role(['members:view'], blockC), role(['members:view'])]);
    expect(wide.paths('view', 'members')).toBe('all');
    expect(wide.can('view', 'members', { path: BLOCK_D })).toBe(true);
  });

  it('drops a grant whose scope did not resolve instead of widening it', () => {
    const access = new CallerAccess([{ ...role(['members:view'], blockC), scopePath: null }]);
    expect(access.can('view', 'members')).toBe(false);
    expect(access.paths('view', 'members')).toEqual([]);
  });

  it('ignores unknown modules and actions from the database', () => {
    const access = new CallerAccess([role(['hrm:view', 'members:fly', 'members:view'])]);
    expect(access.toJSON().grants).toEqual([{ module: 'members', action: 'view', scopeLocationId: null }]);
  });

  it('lists each grant once even when two roles give it', () => {
    const access = new CallerAccess([role(['members:view']), role(['members:view'])]);
    expect(access.toJSON().grants).toHaveLength(1);
  });

  it('does not treat a scope path as a pattern', () => {
    const odd = { id: BLOCK_C_ID, path: '/a.b/' };
    const access = new CallerAccess([role(['members:view'], odd)]);
    expect(access.can('view', 'members', { path: '/a.b/x/' })).toBe(true);
    expect(access.can('view', 'members', { path: '/aXb/x/' })).toBe(false);
  });
});

describe('scopeWhere', () => {
  const toWhere = (prefix: string) => ({ path: { startsWith: prefix } });

  it('adds no filter for whole-society access', () => {
    expect(scopeWhere(new CallerAccess([role(['members:view'])]), 'view', 'members', toWhere)).toEqual({});
  });

  it('ORs the scope prefixes', () => {
    const access = new CallerAccess([role(['members:view'], blockC), role(['members:view'], blockD)]);
    expect(scopeWhere(access, 'view', 'members', toWhere)).toEqual({ OR: [toWhere(BLOCK_C), toWhere(BLOCK_D)] });
  });

  it('matches nothing without a grant', () => {
    expect(scopeWhere(new CallerAccess([]), 'view', 'members', toWhere)).toEqual({ OR: [] });
  });
});
