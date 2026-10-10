import { z } from 'zod';
import { createDto } from './create-dto.js';

/** `:id` route parameter: a UUID, else 400 `validation_failed`. */
export class IdParamDto extends createDto(z.object({ id: z.uuid() })) {}
