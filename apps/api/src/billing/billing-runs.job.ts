import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TIME_ZONE } from '@s57/shared';
import { ENV, type Env } from '../config/env.js';
import { BillingRunsService } from './billing-runs.service.js';

/**
 * Bills the automatic schedules every night at 02:00 Dhaka time. A second API process
 * running the same job waits on the society's run lock and then finds nothing due.
 * Off in tests; they start runs themselves.
 */
@Injectable()
export class BillingRunsJob {
  constructor(
    private readonly runs: BillingRunsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Cron('0 0 2 * * *', { name: 'billing-auto-run', timeZone: TIME_ZONE })
  async nightly(): Promise<void> {
    if (this.env.NODE_ENV === 'test') return;
    await this.runs.runAutoForAll();
  }
}
