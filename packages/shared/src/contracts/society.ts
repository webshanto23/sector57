import { z } from 'zod';

/** `GET /society`: public facts about the society the site serves. */
export const societySchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    nameBn: z.string(),
    nameEn: z.string().nullable(),
    fiscalYearStartMonth: z.number().int().min(1).max(12),
  });
export type Society = z.infer<typeof societySchema>;
