import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  certificateCreateSchema,
  certificateDetailSchema,
  certificateIssueSchema,
  certificateListQuery,
  certificateListSchema,
  certificatePrintSchema,
  certificateTemplatesInputSchema,
  certificateTemplatesViewSchema,
  certificateUnitPeopleQuery,
  certificateUnitPeopleSchema,
  certificateUpdateSchema,
  certificateVoidSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { CertificateActionsService } from './certificate-actions.service.js';
import { CertificatesService } from './certificates.service.js';

export class CertificateListQueryDto extends createDto(certificateListQuery) {}
export class CertificateListDto extends createDto(certificateListSchema) {}
export class CertificateDetailDto extends createDto(certificateDetailSchema) {}
export class CertificateCreateDto extends createDto(certificateCreateSchema) {}
export class CertificateUpdateDto extends createDto(certificateUpdateSchema) {}
export class CertificateIssueDto extends createDto(certificateIssueSchema) {}
export class CertificateVoidDto extends createDto(certificateVoidSchema) {}
export class CertificatePrintDto extends createDto(certificatePrintSchema) {}
export class CertificateTemplatesDto extends createDto(certificateTemplatesInputSchema) {}
export class CertificateUnitPeopleQueryDto extends createDto(certificateUnitPeopleQuery) {}
export class CertificateUnitPeopleDto extends createDto(certificateUnitPeopleSchema) {}
export class CertificateTemplatesViewDto extends createDto(certificateTemplatesViewSchema) {}

/** Certificates and NOCs, under the `certificates` permission where their unit is. The services write their own audit rows. */
@Controller('certificates')
@SkipAudit()
export class CertificatesController {
  constructor(
    private readonly certificates: CertificatesService,
    private readonly actions: CertificateActionsService,
  ) {}

  @Get()
  @Can('certificates', 'view')
  @ZodResponse({ status: 200, type: CertificateListDto })
  list(@CurrentActor() actor: Actor, @Query() query: CertificateListQueryDto) {
    return this.certificates.list(actor, query);
  }

  /** Who a certificate at the unit may be for. 404 `unit_not_found`. */
  @Get('unit-people')
  @Can('certificates', 'view')
  @ZodResponse({ status: 200, type: CertificateUnitPeopleDto })
  unitPeople(@CurrentActor() actor: Actor, @Query() { unitId }: CertificateUnitPeopleQueryDto) {
    return this.certificates.unitPeople(actor, unitId);
  }

  /** The letter text of each type, in both languages. */
  @Get('templates')
  @Can('certificates', 'view')
  @ZodResponse({ status: 200, type: CertificateTemplatesViewDto })
  templates(@CurrentActor() actor: Actor) {
    return this.actions.templates(actor);
  }

  /** A society setting (`settings.edit`). 400 for unknown placeholders. */
  @Put('templates')
  @Can('settings', 'edit')
  @ZodResponse({ status: 200, type: CertificateTemplatesViewDto })
  setTemplates(@CurrentActor() actor: Actor, @Body() body: CertificateTemplatesDto) {
    return this.actions.setTemplates(actor, body);
  }

  @Get(':id')
  @Can('certificates', 'view')
  @ZodResponse({ status: 200, type: CertificateDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.certificates.get(actor, id);
  }

  /** 409 `certificate_not_issued` for a draft. */
  @Get(':id/print')
  @Can('certificates', 'view')
  @ZodResponse({ status: 200, type: CertificatePrintDto })
  print(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.actions.print(actor, id);
  }

  /** A draft. 404 `unit_not_found`, `person_not_found`; 409 `certificate_person_not_at_unit`, `certificate_not_member`. */
  @Post()
  @Can('certificates', 'create')
  @ZodResponse({ status: 201, type: CertificateDetailDto })
  create(@CurrentActor() actor: Actor, @Body() body: CertificateCreateDto) {
    return this.certificates.create(actor, body);
  }

  /** Drafts only. 409 `certificate_not_draft`, `certificate_person_not_at_unit`. */
  @Patch(':id')
  @Can('certificates', 'edit')
  @ZodResponse({ status: 200, type: CertificateDetailDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: CertificateUpdateDto) {
    return this.certificates.update(actor, id, body);
  }

  /** Drafts only; issued ones are voided. 409 `certificate_not_draft`. */
  @Delete(':id')
  @HttpCode(204)
  @Can('certificates', 'delete')
  async remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<void> {
    await this.certificates.remove(actor, id);
  }

  /** 409 `certificate_not_draft`, `certificate_person_not_at_unit`, `certificate_not_member`, `certificate_dues_outstanding`, `certificate_dues_unpaid`. */
  @Post(':id/issue')
  @HttpCode(200)
  @Can('certificates', 'approve')
  @ZodResponse({ status: 200, type: CertificateDetailDto })
  issue(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: CertificateIssueDto) {
    return this.actions.issue(actor, id, body);
  }

  /** 409 `certificate_not_issued`, `certificate_already_void`. */
  @Post(':id/void')
  @HttpCode(200)
  @Can('certificates', 'approve')
  @ZodResponse({ status: 200, type: CertificateDetailDto })
  void(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: CertificateVoidDto) {
    return this.actions.void(actor, id, body);
  }
}
