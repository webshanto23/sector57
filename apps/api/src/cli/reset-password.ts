// Sets a random password for a user of the society in DEFAULT_SOCIETY_SLUG and logs them out everywhere.
// Usage: pnpm --filter @s57/api build && pnpm --filter @s57/api reset-password [01XXXXXXXXX]
// The new password is printed once; give it to the user in person or by phone.
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { bdPhone } from '@s57/shared';
import { AuthService } from '../auth/auth.service.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CliModule } from './cli.module.js';
import { ask, closePrompt, fail } from './prompt.js';

const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error'] });
try {
  const env = app.get<Env>(ENV);
  const prisma = app.get(PrismaService);
  const auth = app.get(AuthService);

  const society = await prisma.societies.findUnique({ where: { slug: env.DEFAULT_SOCIETY_SLUG } });
  if (!society) fail(`Society "${env.DEFAULT_SOCIETY_SLUG}" not found.`);

  const phone = bdPhone.safeParse(process.argv[2] ?? (await ask('Mobile number of the user: ')));
  if (!phone.success) fail('That is not a Bangladesh mobile number.');

  const user = await prisma.users.findUnique({
    where: { society_id_phone: { society_id: society.id, phone: phone.data } },
    select: { id: true, status: true },
  });
  if (!user) fail('No user with this phone.');

  const password = await auth.resetPassword(society.id, user.id, null);
  console.log(`\n✔ New password for ${phone.data}: ${password}`);
  console.log('  The user was logged out everywhere and any lock was cleared.');
  if (user.status !== 'active') console.log(`  Note: this user is "${user.status}" and cannot log in until activated.`);
} finally {
  closePrompt();
  await app.close();
}
