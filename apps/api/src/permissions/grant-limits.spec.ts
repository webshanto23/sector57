import { locationPath } from '@s57/shared';
import { CallerAccess, type RoleGrantRow } from './caller-access.js';
import { canAssign, canGrantPermissions, canManage, type AssignmentGrant } from './grant-limits.js';

const SECTOR = locationPath(null, '11111111-1111-4111-8111-111111111111');
const BLOCK_C = locationPath(SECTOR, '22222222-2222-4222-8222-222222222222');
const BLOCK_D = locationPath(SECTOR, '33333333-3333-4333-8333-333333333333');
const ROAD_C9 = locationPath(BLOCK_C, '44444444-4444-4444-8444-444444444444');

const refs = (permissions: string[]) =>
  permissions.map((p) => {
    const [module, action] = p.split(':');
    return { module: module!, action: action! };
  });

const caller = (...rows: { permissions: string[]; scopePath?: string; isSystem?: boolean }[]) =>
  new CallerAccess(
    rows.map(
      (row): RoleGrantRow => ({
        isSystem: row.isSystem ?? false,
        scopeLocationId: row.scopePath ? row.scopePath.split('/').at(-2)! : null,
        scopePath: row.scopePath ?? null,
        permissions: refs(row.permissions),
      }),
    ),
  );

const assignment = (permissions: string[], scopePath: string | null = null, isSystem = false): AssignmentGrant => ({
  isSystem,
  scopePath,
  permissions: refs(permissions),
});

describe('canGrantPermissions', () => {
  it('lets full access grant anything', () => {
    expect(canGrantPermissions(caller({ permissions: [], isSystem: true }), refs(['audit:delete']))).toBe(true);
  });

  it('allows only permissions the caller holds for the whole society', () => {
    const access = caller({ permissions: ['roles:edit', 'notices:view'] }, { permissions: ['members:edit'], scopePath: BLOCK_C });
    expect(canGrantPermissions(access, refs(['notices:view']))).toBe(true);
    expect(canGrantPermissions(access, refs(['notices:view', 'notices:edit']))).toBe(false);
    // Held only in Block C: not enough to put into a role, which could be given for the whole society.
    expect(canGrantPermissions(access, refs(['members:edit']))).toBe(false);
  });

  it('ignores catalogue rows the code does not know', () => {
    expect(canGrantPermissions(caller({ permissions: [] }), refs(['retired:view']))).toBe(true);
  });
});

describe('canAssign', () => {
  const blockManager = caller({ permissions: ['users:edit'] }, { permissions: ['members:view', 'members:edit'], scopePath: BLOCK_C });

  it('allows a role inside the area the caller holds it in', () => {
    expect(canAssign(blockManager, assignment(['members:view'], BLOCK_C))).toBe(true);
    expect(canAssign(blockManager, assignment(['members:view'], ROAD_C9))).toBe(true);
  });

  it('refuses the same role elsewhere or for the whole society', () => {
    expect(canAssign(blockManager, assignment(['members:view'], BLOCK_D))).toBe(false);
    expect(canAssign(blockManager, assignment(['members:view'], SECTOR))).toBe(false);
    expect(canAssign(blockManager, assignment(['members:view']))).toBe(false);
  });

  it('skips society-wide permissions of a scoped role, since they grant nothing there', () => {
    expect(canAssign(blockManager, assignment(['members:view', 'notices:edit'], BLOCK_C))).toBe(true);
    expect(canAssign(blockManager, assignment(['members:view', 'notices:edit']))).toBe(false);
  });

  it('keeps the system role for full access', () => {
    const everything = caller({ permissions: ['users:edit', 'roles:edit', 'members:view'] });
    expect(canAssign(everything, assignment([], null, true))).toBe(false);
    expect(canAssign(caller({ permissions: [], isSystem: true }), assignment([], null, true))).toBe(true);
  });
});

describe('canManage', () => {
  const officer = caller({ permissions: ['users:edit', 'members:view'] });

  it('allows users holding nothing more than the caller', () => {
    expect(canManage(officer, [])).toBe(true);
    expect(canManage(officer, [assignment(['members:view']), assignment(['members:view'], BLOCK_C)])).toBe(true);
  });

  it('refuses a user with more, or with the system role', () => {
    expect(canManage(officer, [assignment(['members:view', 'billing:view'])])).toBe(false);
    expect(canManage(officer, [assignment([], null, true)])).toBe(false);
  });
});
