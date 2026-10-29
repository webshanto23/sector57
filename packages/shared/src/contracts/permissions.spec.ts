import { canAnywhere, isLocationScoped, isUnderPath, locationPath, meWithAccessSchema } from './index.js';

const SECTOR = '11111111-1111-4111-8111-111111111111';
const BLOCK_C = '22222222-2222-4222-8222-222222222222';
const BLOCK_D = '33333333-3333-4333-8333-333333333333';

describe('locationPath', () => {
  it('starts at the root and ends with a slash', () => {
    const sector = locationPath(null, SECTOR);
    expect(sector).toBe(`/${SECTOR}/`);
    expect(locationPath(sector, BLOCK_C)).toBe(`/${SECTOR}/${BLOCK_C}/`);
  });
});

describe('isUnderPath', () => {
  const sector = locationPath(null, SECTOR);
  const blockC = locationPath(sector, BLOCK_C);
  const blockD = locationPath(sector, BLOCK_D);

  it('includes the scope itself and everything below it', () => {
    expect(isUnderPath(blockC, blockC)).toBe(true);
    expect(isUnderPath(locationPath(blockC, BLOCK_D), blockC)).toBe(true);
  });

  it('excludes siblings and parents', () => {
    expect(isUnderPath(blockD, blockC)).toBe(false);
    expect(isUnderPath(sector, blockC)).toBe(false);
  });
});

describe('isLocationScoped', () => {
  it('splits area modules from society-wide ones', () => {
    expect(isLocationScoped('members')).toBe(true);
    expect(isLocationScoped('notices')).toBe(false);
    expect(isLocationScoped('roles')).toBe(false);
  });
});

describe('canAnywhere', () => {
  const grant = { module: 'members', action: 'view', scopeLocationId: BLOCK_C } as const;

  it('is true for a matching grant, scoped or not', () => {
    expect(canAnywhere({ fullAccess: false, grants: [grant] }, 'members')).toBe(true);
    expect(canAnywhere({ fullAccess: false, grants: [grant] }, 'members', 'edit')).toBe(false);
    expect(canAnywhere({ fullAccess: false, grants: [grant] }, 'units')).toBe(false);
  });

  it('is always true with full access', () => {
    expect(canAnywhere({ fullAccess: true, grants: [] }, 'audit', 'export')).toBe(true);
  });
});

describe('meWithAccessSchema', () => {
  it('rejects an unknown module', () => {
    const me = { id: SECTOR, phone: '01711000000', name: null, nameEn: null, photoUrl: null, nameLocked: false, language: 'bn' };
    const ok = { ...me, access: { fullAccess: false, grants: [grant('members')] } };
    expect(meWithAccessSchema.safeParse(ok).success).toBe(true);
    expect(meWithAccessSchema.safeParse({ ...me, access: { fullAccess: false, grants: [grant('hrm')] } }).success).toBe(false);
  });
});

function grant(module: string) {
  return { module, action: 'view', scopeLocationId: null };
}
