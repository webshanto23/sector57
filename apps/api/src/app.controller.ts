import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ZodResponse } from 'nestjs-zod';
import { PrismaService } from './prisma/prisma.service.js';
import { CurrentSociety } from './society/current-society.decorator.js';
import { NoSociety } from './society/society-context.guard.js';
import { SocietyDto } from './society/society.dto.js';
import type { SocietyContext } from './society/society.service.js';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @NoSociety()
  @SkipThrottle()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;

    return { ok: true };
  }

  /** Public facts about the society this site serves (name for the header, fiscal year). */
  @Get('society')
  @ZodResponse({ status: 200, type: SocietyDto })
  society(@CurrentSociety() society: SocietyContext): SocietyContext {
    return society;
  }
}
