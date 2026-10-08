import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SocietyContextGuard } from './society-context.guard.js';
import { SocietyService } from './society.service.js';

// SocietyContextGuard is registered globally in AppModule, after the throttler.
@Module({
  imports: [PrismaModule],
  providers: [SocietyService, SocietyContextGuard],
  exports: [SocietyService, SocietyContextGuard],
})
export class SocietyModule {}
