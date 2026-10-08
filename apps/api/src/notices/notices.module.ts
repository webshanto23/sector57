import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NoticesService } from './notices.service.js';
import { PublicNoticesController } from './public-notices.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [PublicNoticesController],
  providers: [NoticesService],
})
export class NoticesModule {}
