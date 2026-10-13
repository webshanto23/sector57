import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { FacilitiesModule } from '../facilities/facilities.module.js';
import { MembersModule } from '../members/members.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PropertyModule } from '../property/property.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

/** Step 21: the documents library (society papers, and documents kept with a person or a place). Step 22: a staff member's papers. Step 23: an asset's papers. */
@Module({
  imports: [PrismaModule, AuditModule, StorageModule, PropertyModule, MembersModule, StaffModule, FacilitiesModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
