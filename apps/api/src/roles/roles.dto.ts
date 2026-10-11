import { roleDetailSchema, roleInputSchema, roleListSchema } from '@s57/shared';
import { createDto } from '../common/create-dto.js';

export class RoleListDto extends createDto(roleListSchema) {}
export class RoleDetailDto extends createDto(roleDetailSchema) {}
export class RoleInputDto extends createDto(roleInputSchema) {}
