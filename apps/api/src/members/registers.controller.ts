import { Controller, Get, Query } from '@nestjs/common';
import {
  memberRegisterQuery,
  memberRegisterSchema,
  ownerRegisterQuery,
  ownerRegisterSchema,
  renterRegisterQuery,
  renterRegisterSchema,
} from '@s57/shared';
import { ZodResponse } from 'nestjs-zod';
import { createDto } from '../common/create-dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { RegistersService } from './registers.service.js';

export class MemberRegisterQueryDto extends createDto(memberRegisterQuery) {}
export class MemberRegisterDto extends createDto(memberRegisterSchema) {}
export class OwnerRegisterQueryDto extends createDto(ownerRegisterQuery) {}
export class OwnerRegisterDto extends createDto(ownerRegisterSchema) {}
export class RenterRegisterQueryDto extends createDto(renterRegisterQuery) {}
export class RenterRegisterDto extends createDto(renterRegisterSchema) {}

/** The members, owners and renters registers, read-only, in the caller's `members.view` area. */
@Controller('registers')
export class RegistersController {
  constructor(private readonly registers: RegistersService) {}

  @Get('members')
  @Can('members', 'view')
  @ZodResponse({ status: 200, type: MemberRegisterDto })
  members(@CurrentActor() actor: Actor, @Query() query: MemberRegisterQueryDto) {
    return this.registers.members(actor, query);
  }

  @Get('owners')
  @Can('members', 'view')
  @ZodResponse({ status: 200, type: OwnerRegisterDto })
  owners(@CurrentActor() actor: Actor, @Query() query: OwnerRegisterQueryDto) {
    return this.registers.owners(actor, query);
  }

  @Get('renters')
  @Can('members', 'view')
  @ZodResponse({ status: 200, type: RenterRegisterDto })
  renters(@CurrentActor() actor: Actor, @Query() query: RenterRegisterQueryDto) {
    return this.registers.renters(actor, query);
  }
}
