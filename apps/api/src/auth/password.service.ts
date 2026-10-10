import { Injectable } from '@nestjs/common';
import { argon2, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const argon2Async = promisify(argon2);

// OWASP's argon2id baseline: 19 MiB, 2 passes, 1 lane. About 30 ms per hash.
const PARAMS = { memory: 19_456, passes: 2, parallelism: 1 } as const;
const TAG_LENGTH = 32;
const SALT_LENGTH = 16;

// No look-alikes (0/O, 1/l/I), so a reset password can be read out over the phone.
const RANDOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const b64 = (buffer: Buffer) => buffer.toString('base64').replace(/=+$/, '');

/**
 * argon2id with Node's built-in implementation (no native module to compile).
 * Hashes are stored in the standard PHC form `$argon2id$v=19$m=…,t=…,p=…$salt$hash`,
 * so any argon2 library can verify them later.
 */
@Injectable()
export class PasswordService {
  /** Verified against unknown phones so a wrong phone takes as long as a wrong password. */
  private dummyHash?: Promise<string>;

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const tag = await this.derive(password, salt, PARAMS.memory, PARAMS.passes, PARAMS.parallelism, TAG_LENGTH);
    return `$argon2id$v=19$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}$${b64(salt)}$${b64(tag)}`;
  }

  /** False for a wrong password or a hash this service cannot read. */
  async verify(hash: string, password: string): Promise<boolean> {
    const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(hash);
    if (!match) return false;
    const [, memory, passes, parallelism, salt, expected] = match;
    const expectedTag = Buffer.from(expected!, 'base64');
    const tag = await this.derive(
      password,
      Buffer.from(salt!, 'base64'),
      Number(memory),
      Number(passes),
      Number(parallelism),
      expectedTag.length,
    );
    return tag.length === expectedTag.length && timingSafeEqual(tag, expectedTag);
  }

  /** Spends the same time as `verify` on a real hash; always false. */
  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash(randomBytes(16).toString('hex'));
    await this.verify(await this.dummyHash, password);
    return false;
  }

  /** A random password for an admin reset. */
  random(length = 10): string {
    return Array.from({ length }, () => RANDOM_ALPHABET[randomInt(RANDOM_ALPHABET.length)]).join('');
  }

  private derive(
    password: string,
    nonce: Buffer,
    memory: number,
    passes: number,
    parallelism: number,
    tagLength: number,
  ): Promise<Buffer> {
    return argon2Async('argon2id', { message: password, nonce, memory, passes, parallelism, tagLength });
  }
}
