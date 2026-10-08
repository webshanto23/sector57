import { committeeMemberSchema, isCommitteePosition } from './committee.js';

describe('isCommitteePosition', () => {
  it('knows the standard keys and leaves custom titles alone', () => {
    expect(isCommitteePosition('treasurer')).toBe(true);
    expect(isCommitteePosition('ক্রীড়া সম্পাদক')).toBe(false);
  });
});

describe('committeeMemberSchema', () => {
  it('strips private person fields', () => {
    const parsed = committeeMemberSchema.parse({
      id: '0ccceb85-35cf-479d-9953-aeb79f0c7cb4',
      nameBn: 'নাসরিন সুলতানা',
      nameEn: null,
      position: 'treasurer',
      photoUrl: null,
      phone: '01711000000',
      nid: '1234567890',
    });
    expect(parsed).not.toHaveProperty('phone');
    expect(parsed).not.toHaveProperty('nid');
  });
});
