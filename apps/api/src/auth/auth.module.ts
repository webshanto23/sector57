import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController, MeController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { PasswordService } from './password.service.js';
import { SessionsService } from './sessions.service.js';
import { TokensService } from './tokens.service.js';

// AuthGuard and CsrfGuard are registered globally in AppModule, after the society guard.
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AuthController, MeController],
  providers: [PasswordService, TokensService, SessionsService, AuthService, AuthGuard, CsrfGuard],
  exports: [AuthService, PasswordService, AuthGuard, CsrfGuard],
})
export class AuthModule {}
