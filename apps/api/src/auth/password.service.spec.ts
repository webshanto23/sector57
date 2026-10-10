import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('hashes to the PHC argon2id format and verifies', async () => {
    const hash = await passwords.hash('correct horse');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    await expect(passwords.verify(hash, 'correct horse')).resolves.toBe(true);
    await expect(passwords.verify(hash, 'correct horsE')).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    expect(await passwords.hash('same')).not.toBe(await passwords.hash('same'));
  });

  it('verifies Bangla passwords', async () => {
    const hash = await passwords.hash('আমার-পাসওয়ার্ড');
    await expect(passwords.verify(hash, 'আমার-পাসওয়ার্ড')).resolves.toBe(true);
  });

  it('rejects malformed hashes instead of throwing', async () => {
    await expect(passwords.verify('not-a-hash', 'x')).resolves.toBe(false);
    await expect(passwords.verify('$2b$10$bcrypthash', 'x')).resolves.toBe(false);
  });

  it('dummy verification is always false', async () => {
    await expect(passwords.verifyDummy('anything')).resolves.toBe(false);
  });

  it('makes random passwords without look-alike characters', () => {
    const value = passwords.random();
    expect(value).toHaveLength(10);
    expect(value).not.toMatch(/[0O1lI]/);
    expect(passwords.random()).not.toBe(value);
  });
});
