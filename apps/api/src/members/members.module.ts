import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PropertyModule } from '../property/property.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { LocationPeopleService } from './location-people.service.js';
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
import { OccupantsService } from './occupants.service.js';
import { OrganisationsService } from './organisations.service.js';
import { OwnershipsService } from './ownerships.service.js';
import { PartiesService } from './parties.service.js';
import { PersonsService } from './persons.service.js';
import { TenanciesService } from './tenancies.service.js';

/** Step 10: people, organisations, ownerships, tenancies and households. */
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
  ],
  // The office review (forms module) approves applications through these.
  exports: [PartiesService, MemberRowsService, TenanciesService, OwnershipsService],
})
export class MembersModule {}
