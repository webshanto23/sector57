import { Controller, ForbiddenException, Get, Query, StreamableFile } from '@nestjs/common';
import { directoryAllQuery, directoryListSchema, directoryPrintSchema, directoryQuery, LOCALES } from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { createDto } from '../common/create-dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { csvFile } from '../reports/csv.js';
import { directoryCsv } from './directory-csv.js';
import { DirectoryService } from './directory.service.js';

export class DirectoryQueryDto extends createDto(directoryQuery) {}
export class DirectoryListDto extends createDto(directoryListSchema) {}
export class DirectoryAllQueryDto extends createDto(directoryAllQuery) {}
export class DirectoryCsvQueryDto extends createDto(directoryAllQuery.extend({ lang: z.enum(LOCALES).default('bn') })) {}
export class DirectoryPrintDto extends createDto(directoryPrintSchema) {}

/** The resident directory, read-only, in the caller's `members.view` area. 404 `location_not_found` for a place outside it. */
@Controller('directory')
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Get()
  @Can('members', 'view')
  @ZodResponse({ status: 200, type: DirectoryListDto })
  list(@CurrentActor() actor: Actor, @Query() query: DirectoryQueryDto) {
    return this.directory.list(actor, query);
  }

  /** Everyone under a place, for the door-to-door sheet. */
  @Get('print')
  @Can('members', 'view')
  @ZodResponse({ status: 200, type: DirectoryPrintDto })
  print(@CurrentActor() actor: Actor, @Query() query: DirectoryAllQueryDto) {
    return this.directory.all(actor, query);
  }

  /** Needs `members.export` as well as `members.view`. */
  @Get('csv')
  @Can('members', 'export')
  async csv(@CurrentActor() actor: Actor, @Query() query: DirectoryCsvQueryDto): Promise<StreamableFile> {
    if (!actor.access.can('view', 'members')) throw new ForbiddenException({ code: 'forbidden', message: 'You do not have permission for this' });
    const list = await this.directory.all(actor, query);
    return csvFile('residents', directoryCsv(list, query.lang));
  }
}
