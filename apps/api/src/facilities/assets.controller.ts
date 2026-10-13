import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query, StreamableFile, UploadedFile } from '@nestjs/common';
import {
  assetCreateSchema,
  assetCsvQuery,
  assetDetailSchema,
  assetListQuery,
  assetListSchema,
  assetOptionsSchema,
  assetStatusSchema,
  assetUpdateSchema,
  custodianListSchema,
  custodianQuery,
  LOCALES,
  maintenanceDoneSchema,
  maintenanceDueQuery,
  maintenanceDueSchema,
  maintenancePlanCreateSchema,
  maintenancePlanUpdateSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { csvFile } from '../reports/csv.js';
import { ImageUpload, requireUpload, type UploadedImage } from '../storage/image-upload.js';
import { assetCsv } from './asset-csv.js';
import { AssetsService } from './assets.service.js';
import { MaintenanceService } from './maintenance.service.js';

export class AssetListQueryDto extends createDto(assetListQuery) {}
export class AssetListDto extends createDto(assetListSchema) {}
export class AssetCsvQueryDto extends createDto(assetCsvQuery.extend({ lang: z.enum(LOCALES).default('bn') })) {}
export class AssetDetailDto extends createDto(assetDetailSchema) {}
export class AssetCreateDto extends createDto(assetCreateSchema) {}
export class AssetUpdateDto extends createDto(assetUpdateSchema) {}
export class AssetStatusDto extends createDto(assetStatusSchema) {}
export class AssetOptionsDto extends createDto(assetOptionsSchema) {}
export class CustodianQueryDto extends createDto(custodianQuery) {}
export class CustodianListDto extends createDto(custodianListSchema) {}
export class MaintenanceDueQueryDto extends createDto(maintenanceDueQuery) {}
export class MaintenanceDueDto extends createDto(maintenanceDueSchema) {}
export class MaintenancePlanCreateDto extends createDto(maintenancePlanCreateSchema) {}
export class MaintenancePlanUpdateDto extends createDto(maintenancePlanUpdateSchema) {}
export class MaintenanceDoneDto extends createDto(maintenanceDoneSchema) {}

/** Assets and their upkeep, under the `facilities` permission where each is kept. The services write their own audit rows. */
@Controller('assets')
@SkipAudit()
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly maintenance: MaintenanceService,
  ) {}

  @Get()
  @Can('facilities', 'view')
  @ZodResponse({ status: 200, type: AssetListDto })
  list(@CurrentActor() actor: Actor, @Query() query: AssetListQueryDto) {
    return this.assets.list(actor, query);
  }

  /** Needs `facilities.export` as well as `facilities.view`. */
  @Get('csv')
  @Can('facilities', 'export')
  async csv(@CurrentActor() actor: Actor, @Query() query: AssetCsvQueryDto): Promise<StreamableFile> {
    if (!actor.access.can('view', 'facilities')) throw new ForbiddenException({ code: 'forbidden', message: 'You do not have permission for this' });
    return csvFile('assets', assetCsv(await this.assets.all(actor, query), query.lang));
  }

  @Get('options')
  @Can('facilities', 'view')
  @ZodResponse({ status: 200, type: AssetOptionsDto })
  options(@CurrentActor() actor: Actor) {
    return this.assets.options(actor);
  }

  /** Staff who may look after assets in the caller's area (needs `facilities.create` or `edit` somewhere). */
  @Get('custodians')
  @Can('facilities', 'view')
  @ZodResponse({ status: 200, type: CustodianListDto })
  custodians(@CurrentActor() actor: Actor, @Query() query: CustodianQueryDto) {
    if (!actor.access.can('create', 'facilities') && !actor.access.can('edit', 'facilities')) {
      throw new ForbiddenException({ code: 'forbidden', message: 'You do not have permission for this' });
    }
    return this.assets.custodians(actor, query);
  }

  @Get('maintenance-due')
  @Can('facilities', 'view')
  @ZodResponse({ status: 200, type: MaintenanceDueDto })
  due(@CurrentActor() actor: Actor, @Query() query: MaintenanceDueQueryDto) {
    return this.maintenance.due(actor, query);
  }

  @Get(':id')
  @Can('facilities', 'view')
  @ZodResponse({ status: 200, type: AssetDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.assets.get(actor, id);
  }

  /** 404 `facility_not_found`, `location_not_found`, `staff_not_found`, `vendor_not_found`, `expense_not_found`; 409 `facility_archived`. */
  @Post()
  @Can('facilities', 'create')
  @ZodResponse({ status: 201, type: AssetDetailDto })
  create(@CurrentActor() actor: Actor, @Body() body: AssetCreateDto) {
    return this.assets.create(actor, body);
  }

  /** 409 `asset_gone`; 400 `warranty_before_purchase`; and the lookups' 404s. */
  @Patch(':id')
  @Can('facilities', 'edit')
  @ZodResponse({ status: 200, type: AssetDetailDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: AssetUpdateDto) {
    return this.assets.update(actor, id, body);
  }

  /** Retire, lose or put back need `facilities.approve`. 409 `asset_status_same`, `asset_status_invalid`, `asset_status_changed`. */
  @Post(':id/status')
  @HttpCode(200)
  @Can('facilities', 'edit')
  @ZodResponse({ status: 200, type: AssetDetailDto })
  setStatus(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: AssetStatusDto) {
    return this.assets.setStatus(actor, id, body);
  }

  /** Multipart field `file`: JPEG, PNG or WebP up to 10 MB. */
  @Post(':id/photo')
  @HttpCode(200)
  @Can('facilities', 'edit')
  @ImageUpload()
  @ZodResponse({ status: 200, type: AssetDetailDto })
  setPhoto(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @UploadedFile() file: UploadedImage | undefined) {
    return this.assets.setPhoto(actor, id, requireUpload(file));
  }

  @Delete(':id/photo')
  @Can('facilities', 'edit')
  @ZodResponse({ status: 200, type: AssetDetailDto })
  removePhoto(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.assets.removePhoto(actor, id);
  }

  /** 409 `too_many_plans`, `asset_gone`. */
  @Post(':id/plans')
  @Can('facilities', 'edit')
  @ZodResponse({ status: 201, type: AssetDetailDto })
  addPlan(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: MaintenancePlanCreateDto) {
    return this.maintenance.add(actor, id, body);
  }

  @Patch('plans/:id')
  @Can('facilities', 'edit')
  @ZodResponse({ status: 200, type: AssetDetailDto })
  updatePlan(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: MaintenancePlanUpdateDto) {
    return this.maintenance.update(actor, id, body);
  }

  /** Removes a plan never done, stops one that was. */
  @Delete('plans/:id')
  @Can('facilities', 'edit')
  @ZodResponse({ status: 200, type: AssetDetailDto })
  removePlan(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.maintenance.remove(actor, id);
  }

  /** 400 `future_date`, `done_before_last`; 409 `plan_changed`. */
  @Post('plans/:id/done')
  @HttpCode(200)
  @Can('facilities', 'edit')
  @ZodResponse({ status: 200, type: AssetDetailDto })
  done(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: MaintenanceDoneDto) {
    return this.maintenance.done(actor, id, body);
  }
}
