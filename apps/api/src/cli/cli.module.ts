import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ConfigModule } from '../config/config.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

/** The services the command-line tools need, without the HTTP layer. */
@Module({ imports: [ConfigModule, PrismaModule, AuditModule, AuthModule] })
export class CliModule {}
