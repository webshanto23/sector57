import {
  FORM_KEYS,
  formApproveSchema,
  formDetailSchema,
  formListQuery,
  formListSchema,
  formReceiptSchema,
  formRejectSchema,
  formReviewSchema,
  publicPlaceListSchema,
  publicPlaceQuery,
} from '@s57/shared';
import { z } from 'zod';
import { createDto } from '../common/create-dto.js';

export class FormKeyParamDto extends createDto(z.object({ formKey: z.enum(FORM_KEYS) })) {}
export class FormFileParamDto extends createDto(z.object({ id: z.uuid(), fileId: z.uuid() })) {}
export class FormReceiptDto extends createDto(formReceiptSchema) {}
export class PublicPlaceListDto extends createDto(publicPlaceListSchema) {}
export class PublicPlaceQueryDto extends createDto(publicPlaceQuery) {}
export class FormListDto extends createDto(formListSchema) {}
export class FormListQueryDto extends createDto(formListQuery) {}
export class FormDetailDto extends createDto(formDetailSchema) {}
export class FormReviewDto extends createDto(formReviewSchema) {}
export class FormApproveDto extends createDto(formApproveSchema) {}
export class FormRejectDto extends createDto(formRejectSchema) {}
