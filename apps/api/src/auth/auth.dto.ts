import { changePasswordSchema, loginSchema, meSchema } from '@s57/shared';
import { createDto } from '../common/create-dto.js';

export class LoginDto extends createDto(loginSchema) {}
export class ChangePasswordDto extends createDto(changePasswordSchema) {}
export class MeDto extends createDto(meSchema) {}
