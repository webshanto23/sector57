import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { MembersModule } from '../members/members.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PropertyModule } from '../property/property.module.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';

/** Step 22: staff (one row per stint of work) and their daily attendance. */
@Module({
  imports: [PrismaModule, AuditModule, PropertyModule, MembersModule],
  controllers: [StaffController, AttendanceController],
  providers: [StaffService, AttendanceService],
  // The documents library checks rights on a staff member's papers through it.
  exports: [StaffService],
})
export class StaffModule {}
