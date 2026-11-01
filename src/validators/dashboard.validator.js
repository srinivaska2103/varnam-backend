import { z } from 'zod';

export const dateRangeQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD').optional(),
  compare: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
});
