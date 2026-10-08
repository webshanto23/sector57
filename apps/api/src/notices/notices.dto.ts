import { noticeListQuery, noticeListSchema, noticeSchema, uuid } from '@s57/shared';
import { z } from 'zod';
import { createDto } from '../common/create-dto.js';

export class NoticeDto extends createDto(noticeSchema) {}
export class NoticeListDto extends createDto(noticeListSchema) {}
export class NoticeListQueryDto extends createDto(noticeListQuery) {}
export class NoticeIdParamDto extends createDto(z.object({ id: uuid })) {}
