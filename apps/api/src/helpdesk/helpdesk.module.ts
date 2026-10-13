import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { MembersModule } from '../members/members.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PropertyModule } from '../property/property.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { HelpdeskController } from './helpdesk.controller.js';
import { HelpdeskService } from './helpdesk.service.js';
import { TicketActionsService } from './ticket-actions.service.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

/** Step 24: the helpdesk, problems reported at a place and the office's work on them. */
@Module({
  imports: [PrismaModule, AuditModule, PropertyModule, MembersModule, FinanceModule, StorageModule],
  controllers: [TicketsController, HelpdeskController],
  providers: [HelpdeskService, TicketsService, TicketActionsService],
  // Work orders are raised from a ticket and given to staff the same way.
  exports: [TicketsService, HelpdeskService],
})
export class HelpdeskModule {}
