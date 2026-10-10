// Creates the first super admin of the society in DEFAULT_SOCIETY_SLUG.
// Usage: pnpm --filter @s57/api build && pnpm --filter @s57/api create-admin [--force]
// The password is typed at a hidden prompt, so it never lands in shell history or the repo.
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { bdPhone, newPassword, optionalText, text } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from '../auth/password.service.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CliModule } from './cli.module.js';
import { ask, closePrompt, fail } from './prompt.js';

const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error'] });
try {
  const env = app.get<Env>(ENV);
  const prisma = app.get(PrismaService);
  const passwords = app.get(PasswordService);
  const audit = app.get(AuditService);

  const society = await prisma.societies.findUnique({ where: { slug: env.DEFAULT_SOCIETY_SLUG } });
  if (!society) fail(`Society "${env.DEFAULT_SOCIETY_SLUG}" not found. Run the seed first (pnpm db:seed).`);

  // The protected system role, found by its flag rather than its (editable) name.
  const systemRole = await prisma.roles.findFirst({ where: { society_id: society.id, is_system: true } });
  if (!systemRole) fail('No system role found. Run the seed first (pnpm db:seed).');

  const existing = await prisma.user_roles.count({ where: { role_id: systemRole.id } });
  if (existing > 0 && !process.argv.includes('--force')) {
    fail(`${existing} user(s) already have the "${systemRole.name}" role. Use --force to add another.`);
  }

  console.log(`Creating a "${systemRole.name}" user for ${society.name_en ?? society.name_bn}.\n`);
  const name = text(200).safeParse(await ask('Full name (Bangla or as written): '));
  if (!name.success) fail('A name is required.');
  const nameEn = optionalText(200).parse(await ask('Name in English (optional): '));
  const phone = bdPhone.safeParse(await ask('Mobile number (01XXXXXXXXX): '));
  if (!phone.success) fail('That is not a Bangladesh mobile number.');

  if (await prisma.users.findUnique({ where: { society_id_phone: { society_id: society.id, phone: phone.data } } })) {
    fail('A user with this phone already exists. Use reset-password instead.');
  }

  const password = newPassword.safeParse(await ask('Password (at least 8 characters): ', { hidden: true }));
  if (!password.success) fail('The password must be at least 8 characters.');
  const repeat = newPassword.safeParse(await ask('Repeat the password: ', { hidden: true }));
  if (!repeat.success || repeat.data !== password.data) fail('The passwords do not match.');

  const passwordHash = await passwords.hash(password.data);
  const user = await prisma.$transaction(async (tx) => {
    const person =
      (await tx.persons.findUnique({ where: { society_id_phone: { society_id: society.id, phone: phone.data } } })) ??
      (await tx.persons.create({
        data: { society_id: society.id, full_name: name.data, full_name_en: nameEn, phone: phone.data },
      }));
    const created = await tx.users.create({
      data: {
        society_id: society.id,
        person_id: person.id,
        phone: phone.data,
        password_hash: passwordHash,
        status: 'active',
      },
    });
    await tx.user_roles.create({ data: { user_id: created.id, role_id: systemRole.id } });
    await audit.record(
      {
        societyId: society.id,
        action: 'create',
        entityType: 'user',
        entityId: created.id,
        after: { phone: phone.data, roleId: systemRole.id, via: 'create-admin' },
      },
      tx,
    );
    return created;
  });

  console.log(`\n✔ Created ${phone.data} (user ${user.id}). Log in at /login.`);
} finally {
  closePrompt();
  await app.close();
}
