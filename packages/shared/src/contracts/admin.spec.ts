import { canGrant, createUserSchema, roleInputSchema, updateUserSchema, userListQuery, type Access } from '../index.js';

const BLOCK_C = '22222222-2222-4222-8222-222222222222';

describe('canGrant', () => {
  it('allows everything with full access', () => {
    expect(canGrant({ fullAccess: true, grants: [] }, 'audit', 'delete')).toBe(true);
  });

  it('allows only society-wide grants the caller holds', () => {
    const access: Access = {
      fullAccess: false,
      grants: [
        { module: 'notices', action: 'edit', scopeLocationId: null },
        { module: 'members', action: 'view', scopeLocationId: BLOCK_C },
      ],
    };
    expect(canGrant(access, 'notices', 'edit')).toBe(true);
    expect(canGrant(access, 'notices', 'delete')).toBe(false);
    // Held only in Block C: not enough to put into a role.
    expect(canGrant(access, 'members', 'view')).toBe(false);
  });
});

describe('roleInputSchema', () => {
  it('normalises the name and turns a blank description into null', () => {
    const parsed = roleInputSchema.parse({ name: '  কোষাধ্যক্ষ ', description: '  ', permissions: [] });
    expect(parsed).toEqual({ name: 'কোষাধ্যক্ষ', description: null, permissions: [] });
  });

  it('rejects unknown modules and actions', () => {
    expect(roleInputSchema.safeParse({ name: 'x', permissions: [{ module: 'gates', action: 'view' }] }).success).toBe(false);
    expect(roleInputSchema.safeParse({ name: 'x', permissions: [{ module: 'notices', action: 'own' }] }).success).toBe(false);
  });
});

describe('createUserSchema', () => {
  it('accepts a Bangla-typed phone and fills the defaults', () => {
    const parsed = createUserSchema.parse({ name: 'রহিম', phone: '০১৭১১-২২৩৩৪৪', email: '' });
    expect(parsed).toEqual({ name: 'রহিম', nameEn: null, phone: '01711223344', email: null, language: 'bn', roles: [] });
  });

  it('reports a bad phone and a bad email by code', () => {
    const result = createUserSchema.safeParse({ name: 'x', phone: '12345', email: 'not-an-email' });
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`);
    expect(messages).toEqual(expect.arrayContaining(['phone:invalid_phone', 'email:invalid_email']));
  });
});

describe('updateUserSchema', () => {
  it('leaves out fields that were not sent, and never accepts "invited"', () => {
    expect(updateUserSchema.parse({ status: 'disabled' })).toEqual({ status: 'disabled' });
    expect(updateUserSchema.safeParse({ status: 'invited' }).success).toBe(false);
  });
});

describe('userListQuery', () => {
  it('trims the search and coerces paging', () => {
    expect(userListQuery.parse({ q: ' রহিম ', page: '2' })).toEqual({ q: 'রহিম', page: 2, pageSize: 20 });
  });
});
