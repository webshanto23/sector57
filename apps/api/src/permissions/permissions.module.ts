import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AbilityService } from './ability.service.js';
import { PermissionsGuard } from './permissions.guard.js';

// PermissionsGuard is registered globally in AppModule, after the auth and CSRF guards.
@Module({
  imports: [PrismaModule],
  providers: [AbilityService, PermissionsGuard],
  exports: [AbilityService, PermissionsGuard],
})
export class PermissionsModule {}
