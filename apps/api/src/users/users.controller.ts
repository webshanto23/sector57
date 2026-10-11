import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import {
  CreatedUserDto,
  CreateUserDto,
  PasswordResetDto,
  SetUserRolesDto,
  UpdateUserDto,
  UserDetailDto,
  UserFormOptionsDto,
  UserListDto,
  UserListQueryDto,
} from './users.dto.js';
import { UsersService } from './users.service.js';

/**
 * Dashboard users. Errors: 403 `beyond_your_permissions` (the target or a role needs
 * more than the caller holds), 403 `cannot_change_self`, 409 `last_admin`,
 * 409 `phone_taken`, 400 `invalid_assignment`. The service writes audit rows.
 */
@Controller('users')
@SkipAudit()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Can('users', 'view')
  @ZodResponse({ status: 200, type: UserListDto })
  list(@CurrentSociety() society: SocietyContext, @Query() query: UserListQueryDto) {
    return this.users.list(society.id, query);
  }

  /** The roles and areas the user form can offer. Declared before `:id`. */
  @Get('options')
  @Can('users', 'view')
  @ZodResponse({ status: 200, type: UserFormOptionsDto })
  options(@CurrentActor() actor: Actor) {
    return this.users.options(actor);
  }

  @Get(':id')
  @Can('users', 'view')
  @ZodResponse({ status: 200, type: UserDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.users.get(actor, id);
  }

  /** Answers with the temporary password, once. Give it to the user in person or by phone. */
  @Post()
  @Can('users', 'create')
  @ZodResponse({ status: 201, type: CreatedUserDto })
  create(@CurrentActor() actor: Actor, @Body() body: CreateUserDto) {
    return this.users.create(actor, body);
  }

  @Patch(':id')
  @Can('users', 'edit')
  @ZodResponse({ status: 200, type: UserDetailDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: UpdateUserDto) {
    return this.users.update(actor, id, body);
  }

  @Put(':id/roles')
  @Can('users', 'edit')
  @ZodResponse({ status: 200, type: UserDetailDto })
  setRoles(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: SetUserRolesDto) {
    return this.users.setRoles(actor, id, body.roles);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @Can('users', 'edit')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ZodResponse({ status: 200, type: PasswordResetDto })
  resetPassword(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto) {
    return this.users.resetPassword(actor, id);
  }
}
