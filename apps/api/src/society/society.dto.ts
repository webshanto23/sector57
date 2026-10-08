import { societySchema } from '@s57/shared';
import { createDto } from '../common/create-dto.js';

export class SocietyDto extends createDto(societySchema) {}
