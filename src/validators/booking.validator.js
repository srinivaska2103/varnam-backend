import { z } from 'zod';

const bookingStatusEnum = z.enum([
  'DRAFT',
  'CONFIRMED',
  'PLANNING',
  'READY',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'POSTPONED',
]);

const eventTypeEnum = z.enum([
  'WEDDING',
  'ENGAGEMENT',
  'RECEPTION',
  'SANGEET',
  'HALDI',
  'MEHENDI',
  'TRIAL',
  'OTHER',
]);

export const bookingEventInputSchema = z.object({
  event_kind: eventTypeEnum.default('WEDDING'),
  title: z.string().trim().min(2, 'Event title must be at least 2 characters').max(180),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Event date must be YYYY-MM-DD'),
  start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, 'Start time must be HH:MM or HH:MM:SS').optional().nullable(),
  end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, 'End time must be HH:MM or HH:MM:SS').optional().nullable(),
  venue: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  instructions: z.string().trim().max(2000).optional().nullable(),
  assigned_user_id: z.string().uuid().optional().nullable(),
});

export const createBookingSchema = z.object({
  customer_id: z.string().uuid('Customer ID must be a valid UUID'),
  enquiry_id: z.string().uuid().optional().nullable(),
  package_id: z.string().uuid().optional().nullable(),
  package_name_snapshot: z.string().trim().max(180).optional().nullable(),
  booking_number: z.string().trim().max(60).optional(),
  status: bookingStatusEnum.default('CONFIRMED'),
  total_amount_paise: z.coerce.number().int().nonnegative('Total amount cannot be negative').default(0),
  discount_paise: z.coerce.number().int().nonnegative('Discount cannot be negative').default(0),
  notes: z.string().trim().max(2000).optional().nullable(),
  // Initial event can be passed during booking creation
  event: bookingEventInputSchema.optional().nullable(),
  events: z.array(bookingEventInputSchema).optional(),
});

export const updateBookingSchema = z.object({
  package_id: z.string().uuid().optional().nullable(),
  package_name_snapshot: z.string().trim().max(180).optional().nullable(),
  total_amount_paise: z.coerce.number().int().nonnegative().optional(),
  discount_paise: z.coerce.number().int().nonnegative().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const updateBookingStatusSchema = z.object({
  status: bookingStatusEnum,
  note: z.string().trim().max(1000).optional().nullable(),
  cancellation_reason: z.string().trim().max(1000).optional().nullable(),
});

export const cancelBookingSchema = z.object({
  cancellation_reason: z.string().trim().min(3, 'Cancellation reason is required').max(1000),
  note: z.string().trim().max(1000).optional().nullable(),
  approved_refundable_paise: z.coerce.number().int().min(0).optional(),
  refund_approval_notes: z.string().trim().max(1000).optional().nullable(),
});

export const listBookingQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  status: bookingStatusEnum.optional(),
  event_kind: eventTypeEnum.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.enum(['created_at', 'total_amount_paise', 'booking_number']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const calendarQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'endDate must be YYYY-MM-DD'),
  status: bookingStatusEnum.optional(),
  view: z.enum(['day', 'week', 'month']).optional().default('month'),
});
