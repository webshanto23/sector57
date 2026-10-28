import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UploadedFile } from '@nestjs/common';
import {
  endSchema,
  locationPeopleSchema,
  occupantCreateSchema,
  occupantSchema,
  occupantUpdateSchema,
  organisationDetailSchema,
  organisationUpdateSchema,
  ownershipCreateSchema,
  ownershipSchema,
  ownershipTransferSchema,
  ownershipUpdateSchema,
  personDetailSchema,
  personInputSchema,
  personUpdateSchema,
  personVerifySchema,
  tenancyCreateSchema,
  tenancySchema,
  tenancyUpdateSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Authenticated, Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { ImageUpload, requireUpload, type UploadedImage } from '../storage/image-upload.js';
import { LocationPeopleService } from './location-people.service.js';
import { OccupantsService } from './occupants.service.js';
import { OrganisationsService } from './organisations.service.js';
import { OwnershipsService } from './ownerships.service.js';
import { PersonsService } from './persons.service.js';
import { TenanciesService } from './tenancies.service.js';

export class PersonDetailDto extends createDto(personDetailSchema) {}
export class PersonInputDto extends createDto(personInputSchema) {}
export class PersonUpdateDto extends createDto(personUpdateSchema) {}
export class PersonVerifyDto extends createDto(personVerifySchema) {}
export class OrganisationDetailDto extends createDto(organisationDetailSchema) {}
export class OrganisationUpdateDto extends createDto(organisationUpdateSchema) {}
export class OwnershipDto extends createDto(ownershipSchema) {}
export class OwnershipListDto extends createDto(z.object({ items: z.array(ownershipSchema) })) {}
export class OwnershipCreateDto extends createDto(ownershipCreateSchema) {}
export class OwnershipTransferDto extends createDto(ownershipTransferSchema) {}
export class OwnershipUpdateDto extends createDto(ownershipUpdateSchema) {}
export class TenancyDto extends createDto(tenancySchema) {}
export class TenancyCreateDto extends createDto(tenancyCreateSchema) {}
export class TenancyUpdateDto extends createDto(tenancyUpdateSchema) {}
export class OccupantDto extends createDto(occupantSchema) {}
export class OccupantCreateDto extends createDto(occupantCreateSchema) {}
export class OccupantUpdateDto extends createDto(occupantUpdateSchema) {}
export class EndDto extends createDto(endSchema) {}
export class LocationPeopleDto extends createDto(locationPeopleSchema) {}

/** People. The services check every row against the caller's area and write the audit rows. */
@Controller('persons')
@SkipAudit()
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  /** A person not linked to any unit yet; whole-society callers only (403 otherwise). 409 when the phone or NID is taken. */
  @Post()
  @Can('members', 'create')
  @ZodResponse({ status: 201, type: PersonDetailDto })
  create(@CurrentActor() actor: Actor, @Body() body: PersonInputDto) {
    return this.persons.create(actor, body);
  }

  @Get(':id')
  @Can('members', 'view')
  @ZodResponse({ status: 200, type: PersonDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.persons.get(actor, id);
  }

  @Patch(':id')
  @Can('members', 'edit')
  @ZodResponse({ status: 200, type: PersonDetailDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: PersonUpdateDto) {
    return this.persons.update(actor, id, body);
  }

  @Put(':id/verified')
  @Can('members', 'approve')
  @ZodResponse({ status: 200, type: PersonDetailDto })
  verify(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: PersonVerifyDto) {
    return this.persons.setVerified(actor, id, body.verified);
  }

  /** Only a person nothing refers to (409 `person_in_use`). */
  @Delete(':id')
  @HttpCode(204)
  @Can('members', 'delete')
  async remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<void> {
    await this.persons.remove(actor, id);
  }

  /** Multipart field `file`: JPEG, PNG or WebP up to 10 MB. */
  @Post(':id/photo')
  @HttpCode(200)
  @Can('members', 'edit')
  @ImageUpload()
  @ZodResponse({ status: 200, type: PersonDetailDto })
  setPhoto(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @UploadedFile() file: UploadedImage | undefined) {
    return this.persons.setPhoto(actor, id, requireUpload(file));
  }

  @Delete(':id/photo')
  @Can('members', 'edit')
  @ZodResponse({ status: 200, type: PersonDetailDto })
  removePhoto(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.persons.removePhoto(actor, id);
  }
}

@Controller('organisations')
@SkipAudit()
export class OrganisationsController {
  constructor(private readonly organisations: OrganisationsService) {}

  @Get(':id')
  @Can('members', 'view')
  @ZodResponse({ status: 200, type: OrganisationDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.organisations.get(actor, id);
  }

  @Patch(':id')
  @Can('members', 'edit')
  @ZodResponse({ status: 200, type: OrganisationDetailDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: OrganisationUpdateDto) {
    return this.organisations.update(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('members', 'delete')
  async remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<void> {
    await this.organisations.remove(actor, id);
  }
}

@Controller('ownerships')
@SkipAudit()
export class OwnershipsController {
  constructor(private readonly ownerships: OwnershipsService) {}

  /** One more (co-)owner. 409 `shares_over_100` or `already_owner`. */
  @Post()
  @Can('ownerships', 'create')
  @ZodResponse({ status: 201, type: OwnershipDto })
  create(@CurrentActor() actor: Actor, @Body() body: OwnershipCreateDto) {
    return this.ownerships.create(actor, body);
  }

  /** The current owners stop on `date` and the listed owners start. Needs `ownerships.edit` and `create` there. */
  @Post('transfer')
  @HttpCode(200)
  @Can('ownerships', 'edit')
  @ZodResponse({ status: 200, type: OwnershipListDto })
  async transfer(@CurrentActor() actor: Actor, @Body() body: OwnershipTransferDto) {
    return { items: await this.ownerships.transfer(actor, body) };
  }

  @Patch(':id')
  @Can('ownerships', 'edit')
  @ZodResponse({ status: 200, type: OwnershipDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: OwnershipUpdateDto) {
    return this.ownerships.update(actor, id, body);
  }

  @Post(':id/end')
  @HttpCode(200)
  @Can('ownerships', 'edit')
  @ZodResponse({ status: 200, type: OwnershipDto })
  end(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: EndDto) {
    return this.ownerships.end(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('ownerships', 'delete')
  async remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<void> {
    await this.ownerships.remove(actor, id);
  }
}

@Controller('tenancies')
@SkipAudit()
export class TenanciesController {
  constructor(private readonly tenancies: TenanciesService) {}

  /** 409 `tenancy_open_exists` when the unit already has an open tenancy. */
  @Post()
  @Can('tenancies', 'create')
  @ZodResponse({ status: 201, type: TenancyDto })
  create(@CurrentActor() actor: Actor, @Body() body: TenancyCreateDto) {
    return this.tenancies.create(actor, body);
  }

  @Patch(':id')
  @Can('tenancies', 'edit')
  @ZodResponse({ status: 200, type: TenancyDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: TenancyUpdateDto) {
    return this.tenancies.update(actor, id, body);
  }

  /** Ends the tenancy and its household rows. */
  @Post(':id/end')
  @HttpCode(200)
  @Can('tenancies', 'edit')
  @ZodResponse({ status: 200, type: TenancyDto })
  end(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: EndDto) {
    return this.tenancies.end(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('tenancies', 'delete')
  async remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<void> {
    await this.tenancies.remove(actor, id);
  }
}

/** Household rows; they use the `members` permission. */
@Controller('occupants')
@SkipAudit()
export class OccupantsController {
  constructor(private readonly occupants: OccupantsService) {}

  @Post()
  @Can('members', 'create')
  @ZodResponse({ status: 201, type: OccupantDto })
  create(@CurrentActor() actor: Actor, @Body() body: OccupantCreateDto) {
    return this.occupants.create(actor, body);
  }

  @Patch(':id')
  @Can('members', 'edit')
  @ZodResponse({ status: 200, type: OccupantDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: OccupantUpdateDto) {
    return this.occupants.update(actor, id, body);
  }

  @Post(':id/end')
  @HttpCode(200)
  @Can('members', 'edit')
  @ZodResponse({ status: 200, type: OccupantDto })
  end(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: EndDto) {
    return this.occupants.end(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('members', 'delete')
  async remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<void> {
    await this.occupants.remove(actor, id);
  }
}

/** Owners, tenancies and households of one location, each shown only with its module's `view` there. */
@Controller('locations')
export class LocationPeopleController {
  constructor(private readonly people: LocationPeopleService) {}

  @Get(':id/people')
  @Authenticated()
  @ZodResponse({ status: 200, type: LocationPeopleDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.people.get(actor, id);
  }
}
