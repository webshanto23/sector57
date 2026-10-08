import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CommitteeService } from './committee.service.js';
import { PublicCommitteeController } from './public-committee.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [PublicCommitteeController],
  providers: [CommitteeService],
})
export class CommitteeModule {}
