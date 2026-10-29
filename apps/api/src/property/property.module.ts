import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LevelsController } from './levels.controller.js';
import { CombineService } from './combine.service.js';
import { LayoutService } from './layout.service.js';
import { LevelsService } from './levels.service.js';
import { LocationSearchService } from './location-search.service.js';
import { LocationsController } from './locations.controller.js';
import { LocationRemovalService } from './location-removal.service.js';
import { SeparateService } from './separate.service.js';
import { LocationsService } from './locations.service.js';
import { OccupancyService } from './occupancy.service.js';
import { TreeService } from './tree.service.js';
import { UnitPeopleService } from './unit-people.service.js';
import { UnitStoreysService } from './unit-storeys.service.js';
import { UnitTypesController } from './unit-types.controller.js';
import { UnitTypesService } from './unit-types.service.js';
import { UnitsController } from './units.controller.js';
import { UnitsService } from './units.service.js';

/** Step 9: the location tree, its levels, and the units; Step 34: the society's unit types. */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [LevelsController, LocationsController, UnitTypesController, UnitsController],
  providers: [TreeService, OccupancyService, LevelsService, LayoutService, CombineService, SeparateService, LocationSearchService, LocationsService, LocationRemovalService, UnitTypesService, UnitPeopleService, UnitStoreysService, UnitsService],
  exports: [TreeService, OccupancyService, UnitTypesService],
})
export class PropertyModule {}
