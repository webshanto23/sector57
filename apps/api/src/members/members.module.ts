import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PropertyModule } from '../property/property.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { LocationPeopleService } from './location-people.service.js';
import { DirectoryController } from './directory.controller.js';
import { DirectoryService } from './directory.service.js';
import { MemberRowsService } from './member-rows.service.js';
import {
  LocationPeopleController,
  MembersController,
  OccupantsController,
  OrganisationsController,
  OwnershipsController,
  PersonsController,
  TenanciesController,
} from './members.controller.js';
import { MembersService } from './members.service.js';
import { MovesController } from './moves.controller.js';
import { MovesService } from './moves.service.js';
import { OccupantsService } from './occupants.service.js';
import { OrganisationsService } from './organisations.service.js';
import { OwnershipsService } from './ownerships.service.js';
import { PartiesService } from './parties.service.js';
import { PersonsService } from './persons.service.js';
import { TenanciesService } from './tenancies.service.js';

/** Step 10: people, organisations, ownerships, tenancies and households. Step 20: move-in and move-out checklists, the resident directory. */
@Module({
  imports: [PrismaModule, AuditModule, PropertyModule, StorageModule],
  controllers: [
    MembersController,
    PersonsController,
    OrganisationsController,
    OwnershipsController,
    TenanciesController,
    OccupantsController,
    LocationPeopleController,
    MovesController,
    DirectoryController,
  ],
  providers: [
    PartiesService,
    MemberRowsService,
    MembersService,
    PersonsService,
    OrganisationsService,
    OwnershipsService,
    TenanciesService,
    OccupantsService,
    LocationPeopleService,
    MovesService,
    DirectoryService,
  ],
  // The office review (forms module) approves applications through these.
  exports: [PartiesService, MemberRowsService, TenanciesService, OwnershipsService],
})
export class MembersModule {}
