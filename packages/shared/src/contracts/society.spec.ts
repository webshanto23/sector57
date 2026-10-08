import { societySchema } from './society.js';

describe('societySchema', () => {
  it('drops unknown fields such as status', () => {
    const parsed = societySchema.parse({
      id: '0ccceb85-35cf-479d-9953-aeb79f0c7cb4',
      slug: 'sector57',
      nameBn: 'উত্তরা সেক্টর ৫৭',
      nameEn: null,
      fiscalYearStartMonth: 7,
      status: 'active',
    });
    expect(parsed).not.toHaveProperty('status');
  });
});
