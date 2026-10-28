import { memberRegisterQuery, ownerRegisterQuery, phoneLinks, renterRegisterQuery } from './registers.js';

describe('phoneLinks', () => {
  it('links a stored phone, with 880 for WhatsApp', () => {
    expect(phoneLinks('01712345678')).toEqual({ tel: 'tel:01712345678', whatsapp: 'https://wa.me/8801712345678' });
    expect(phoneLinks('০১৭১২৩৪৫৬৭৮')?.whatsapp).toBe('https://wa.me/8801712345678');
  });

  it('gives nothing for a number too short to dial', () => {
    expect(phoneLinks('12')).toBeNull();
  });
});

describe('register queries', () => {
  it('lists active members by default', () => {
    expect(memberRegisterQuery.parse({}).status).toBe('active');
  });

  it('refuses unknown filters', () => {
    expect(ownerRegisterQuery.safeParse({ membership: 'maybe' }).success).toBe(false);
    expect(renterRegisterQuery.safeParse({ status: 'ended' }).success).toBe(false);
    expect(renterRegisterQuery.safeParse({ unitType: 'দোকান' }).success).toBe(false);
  });
});
