import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ZodResponse } from 'nestjs-zod';
import { SkipAudit } from '../audit/audit.decorators.js';
import { IdParamDto } from '../common/id-param.dto.js';
import { Can, CurrentActor, type Actor } from '../permissions/permissions.decorators.js';
import { CurrentSociety } from '../society/current-society.decorator.js';
import type { SocietyContext } from '../society/society.service.js';
import { RoleDetailDto, RoleInputDto, RoleListDto } from './roles.dto.js';
import { RolesService } from './roles.service.js';

/**
 * Roles and their permission matrix. 403 `beyond_your_permissions` when the caller
 * doesn't hold a permission they try to grant or remove; 403 `system_role_protected`
 * for the system role. The service writes audit rows with before and after.
 */
@Controller('roles')
@SkipAudit()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @Can('roles', 'view')
  @ZodResponse({ status: 200, type: RoleListDto })
  list(@CurrentSociety() society: SocietyContext) {
    return this.roles.list(society.id);
  }

  @Get(':id')
  @Can('roles', 'view')
  @ZodResponse({ status: 200, type: RoleDetailDto })
  get(@CurrentSociety() society: SocietyContext, @Param() { id }: IdParamDto) {
    return this.roles.get(society.id, id);
  }

  /** 409 `role_name_taken` when the name is in use. */
  @Post()
  @Can('roles', 'create')
  @ZodResponse({ status: 201, type: RoleDetailDto })
  create(@CurrentActor() actor: Actor, @Body() body: RoleInputDto) {
    return this.roles.create(actor, body);
  }

  /** The whole role: name, description and every ticked permission. */
  @Put(':id')
  @Can('roles', 'edit')
  @ZodResponse({ status: 200, type: RoleDetailDto })
  update(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Body() body: RoleInputDto) {
    return this.roles.update(actor, id, body);
  }

  /** 409 `role_in_use` while any user holds the role. */
  @Delete(':id')
  @HttpCode(204)
  @Can('roles', 'delete')
  async remove(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto): Promise<void> {
    await this.roles.remove(actor, id);
  }
}
