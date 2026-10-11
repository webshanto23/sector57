import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LevelsController } from './levels.controller.js';
import { LevelsService } from './levels.service.js';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';
import { OccupancyService } from './occupancy.service.js';
import { TreeService } from './tree.service.js';
import { UnitsController } from './units.controller.js';
import { UnitsService } from './units.service.js';

/** Step 9: the location tree, its levels, and the units. */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [LevelsController, LocationsController, UnitsController],
  providers: [TreeService, OccupancyService, LevelsService, LocationsService, UnitsService],
  exports: [TreeService, OccupancyService],
})
export class PropertyModule {}
