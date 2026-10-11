import {
  createdUserSchema,
  createUserSchema,
  passwordResetSchema,
  setUserRolesSchema,
  updateUserSchema,
  userDetailSchema,
  userFormOptionsSchema,
  userListQuery,
  userListSchema,
} from '@s57/shared';
import { createDto } from '../common/create-dto.js';

export class UserListQueryDto extends createDto(userListQuery) {}
export class UserListDto extends createDto(userListSchema) {}
export class UserDetailDto extends createDto(userDetailSchema) {}
export class UserFormOptionsDto extends createDto(userFormOptionsSchema) {}
export class CreateUserDto extends createDto(createUserSchema) {}
export class CreatedUserDto extends createDto(createdUserSchema) {}
export class UpdateUserDto extends createDto(updateUserSchema) {}
export class SetUserRolesDto extends createDto(setUserRolesSchema) {}
export class PasswordResetDto extends createDto(passwordResetSchema) {}
