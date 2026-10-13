import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UploadedFile } from '@nestjs/common';
import {
  ticketAssignSchema,
  ticketCommentSchema,
  ticketCreateSchema,
  ticketDetailSchema,
  ticketListQuery,
  ticketListSchema,
  ticketStaffListSchema,
  ticketStaffQuery,
  ticketStatusSchema,
  ticketUpdateSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { createDto } from '../common/create-dto.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { ImageUpload, requireUpload, type UploadedImage } from '../storage/image-upload.js';
import { HelpdeskService } from './helpdesk.service.js';
import { TicketActionsService } from './ticket-actions.service.js';
import { TicketsService } from './tickets.service.js';

export class TicketListQueryDto extends createDto(ticketListQuery) {}
export class TicketListDto extends createDto(ticketListSchema) {}
export class TicketDetailDto extends createDto(ticketDetailSchema) {}
export class TicketCreateDto extends createDto(ticketCreateSchema) {}
export class TicketUpdateDto extends createDto(ticketUpdateSchema) {}
export class TicketAssignDto extends createDto(ticketAssignSchema) {}
export class TicketStatusDto extends createDto(ticketStatusSchema) {}
export class TicketCommentDto extends createDto(ticketCommentSchema) {}
export class TicketStaffQueryDto extends createDto(ticketStaffQuery) {}
export class TicketStaffListDto extends createDto(ticketStaffListSchema) {}

/** Tickets (অভিযোগ), under the `helpdesk` permission where the problem is. The services write their own audit rows. */
@Controller('tickets')
@SkipAudit()
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly actions: TicketActionsService,
    private readonly helpdesk: HelpdeskService,
  ) {}

  @Get()
  @Can('helpdesk', 'view')
  @ZodResponse({ status: 200, type: TicketListDto })
  list(@CurrentActor() actor: Actor, @Query() query: TicketListQueryDto) {
    return this.tickets.list(actor, query);
  }

  /** Current staff a ticket may be given to. */
  @Get('staff')
  @Can('helpdesk', 'view')
  @ZodResponse({ status: 200, type: TicketStaffListDto })
  staff(@CurrentActor() actor: Actor, @Query() query: TicketStaffQueryDto) {
    return this.helpdesk.staff(actor, query);
  }

  @Get(':id')
  @Can('helpdesk', 'view')
  @ZodResponse({ status: 200, type: TicketDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.tickets.get(actor, id);
  }

  /** 404 `location_not_found`, `staff_not_found`, `person_not_found`. */
  @Post()
  @Can('helpdesk', 'create')
  @ZodResponse({ status: 201, type: TicketDetailDto })
  create(@CurrentActor() actor: Actor, @Body() body: TicketCreateDto) {
    return this.tickets.create(actor, body);
  }

  /** 409 `ticket_finished`. */
  @Patch(':id')
  @Can('helpdesk', 'edit')
  @ZodResponse({ status: 200, type: TicketDetailDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: TicketUpdateDto) {
    return this.tickets.update(actor, id, body);
  }

  /** 409 `ticket_finished`, `ticket_assignee_same`, `ticket_status_changed`. */
  @Post(':id/assign')
  @HttpCode(200)
  @Can('helpdesk', 'edit')
  @ZodResponse({ status: 200, type: TicketDetailDto })
  assign(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: TicketAssignDto) {
    return this.actions.assign(actor, id, body);
  }

  /**
   * 409 `ticket_status_same`, `ticket_status_invalid`, `ticket_status_changed`. Working on and
   * resolving need `helpdesk.edit`; closing, cancelling and reopening `helpdesk.approve` (checked where the ticket is).
   */
  @Post(':id/status')
  @HttpCode(200)
  @Can('helpdesk', 'view')
  @ZodResponse({ status: 200, type: TicketDetailDto })
  setStatus(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: TicketStatusDto) {
    return this.actions.setStatus(actor, id, body);
  }

  /** 409 `ticket_finished`. */
  @Post(':id/comments')
  @HttpCode(200)
  @Can('helpdesk', 'edit')
  @ZodResponse({ status: 200, type: TicketDetailDto })
  comment(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: TicketCommentDto) {
    return this.actions.comment(actor, id, body);
  }

  /** Multipart field `file`: JPEG, PNG or WebP up to 10 MB. 409 `ticket_finished`, `ticket_photo_limit`. */
  @Post(':id/photos')
  @HttpCode(200)
  @Can('helpdesk', 'edit')
  @ImageUpload()
  @ZodResponse({ status: 200, type: TicketDetailDto })
  addPhoto(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @UploadedFile() file: UploadedImage | undefined) {
    return this.actions.addPhoto(actor, id, requireUpload(file));
  }
}
