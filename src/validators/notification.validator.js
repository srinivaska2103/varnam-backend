import { z } from 'zod';

export const updateNotificationPreferencesSchema = z.object({
  preferences: z.array(
    z.object({
      event_key: z.string().trim().min(1, 'event_key is required'),
      channel: z.enum(['EMAIL', 'WHATSAPP', 'IN_APP']).default('EMAIL'),
      enabled: z.boolean().default(true),
      send_to_artist: z.boolean().default(true),
      send_to_customer: z.boolean().default(false),
      minutes_before: z.number().int().min(0).optional().nullable(),
    })
  ).min(1, 'At least one preference setting must be provided'),
});

export const listNotificationsQuerySchema = z.object({
  status: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED']).optional(),
  channel: z.enum(['EMAIL', 'WHATSAPP', 'IN_APP']).optional(),
  search: z.string().trim().optional(),
  sortBy: z.enum(['newest', 'oldest', 'scheduled']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).default(1),
});

