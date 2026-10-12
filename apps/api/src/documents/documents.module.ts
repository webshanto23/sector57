import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { MembersModule } from '../members/members.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PropertyModule } from '../property/property.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

/** Step 21: the documents library (society papers, and documents kept with a person or a place). */
@Module({
  imports: [PrismaModule, AuditModule, StorageModule, PropertyModule, MembersModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
