import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { MembersModule } from '../members/members.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PropertyModule } from '../property/property.module.js';
import { FormsController } from './forms.controller.js';
import { FormsService } from './forms.service.js';
import { PublicFormsController } from './public-forms.controller.js';
import { PublicFormsService } from './public-forms.service.js';

/** Steps 3 + 8: the public membership and renter forms, and the office's review of them. */
@Module({
  imports: [PrismaModule, AuditModule, PropertyModule, MembersModule],
  controllers: [PublicFormsController, FormsController],
  providers: [PublicFormsService, FormsService],
})
export class FormsModule {}
