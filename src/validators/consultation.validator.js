import { z } from 'zod';

// Allowed consultation statuses in schema: REQUESTED, CONFIRMED, RESCHEDULED, COMPLETED, CANCELLED, NO_SHOW
export const consultationStatusEnum = z.enum([
  'REQUESTED',
  'CONFIRMED',
  'RESCHEDULED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);

// Allowed consultation types
export const consultationTypeEnum = z.enum(['IN_PERSON', 'PHONE', 'VIDEO', 'STUDIO', 'TRIAL', 'OTHER']);

// Helper for ISO date strings
const dateStringSchema = z.string().datetime({ offset: true }).or(
  z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/, 'Invalid datetime format')
);

/**
 * Schema for customer preferences snapshot/linkage
 */
export const customerPreferencesInputSchema = z.object({
  makeup_preferences: z.string().max(1000).optional().nullable(),
  hairstyle_preferences: z.string().max(1000).optional().nullable(),
  skin_notes: z.string().max(1000).optional().nullable(),
  outfit_notes: z.string().max(1000).optional().nullable(),
  inspiration_links: z.array(z.string().url('Invalid inspiration link')).optional().default([]),
  special_requirements: z.string().max(1000).optional().nullable(),
});

/**
 * POST /api/consultations - Schedule consultation strictly matching consultations table
 */
export const createConsultationSchema = z.object({
  customer_id: z.string().uuid('Invalid customer UUID').optional().nullable(),
  enquiry_id: z.string().uuid('Invalid enquiry UUID').optional().nullable(),
  booking_id: z.string().uuid('Invalid booking UUID').optional().nullable(),
  requested_name: z.string().min(1, 'Bride / client name is required').max(180).trim(),
  requested_phone: z.string().min(7, 'Phone number must be at least 7 characters').max(30).trim(),
  consultation_type: consultationTypeEnum.default('IN_PERSON'),
  status: consultationStatusEnum.default('REQUESTED'),
  requested_at: dateStringSchema.optional().nullable(),
  scheduled_start: dateStringSchema.optional().nullable(),
  scheduled_end: dateStringSchema.optional().nullable(),
  location_name: z.string().max(180).trim().optional().nullable(),
  location_address: z.string().trim().optional().nullable(),
  location_map_url: z.string().url('Invalid map URL').optional().nullable(),
  meeting_url: z.string().url('Invalid meeting URL').optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  confirmed_by: z.string().uuid('Invalid user UUID').optional().nullable(),
});

/**
 * PATCH /api/consultations/:id - Update consultation details strictly matching consultations table
 */
export const updateConsultationSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  enquiry_id: z.string().uuid().optional().nullable(),
  booking_id: z.string().uuid().optional().nullable(),
  requested_name: z.string().min(1).max(180).trim().optional(),
  requested_phone: z.string().min(7).max(30).trim().optional(),
  consultation_type: consultationTypeEnum.optional(),
  scheduled_start: dateStringSchema.optional().nullable(),
  scheduled_end: dateStringSchema.optional().nullable(),
  location_name: z.string().max(180).trim().optional().nullable(),
  location_address: z.string().trim().optional().nullable(),
  location_map_url: z.string().url().optional().nullable(),
  meeting_url: z.string().url().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  confirmed_by: z.string().uuid().optional().nullable(),
});

/**
 * PATCH /api/consultations/:id/status - Update consultation status
 */
export const updateConsultationStatusSchema = z.object({
  status: consultationStatusEnum,
  notes: z.string().max(1000).trim().optional(),
  scheduled_start: dateStringSchema.optional().nullable(),
  scheduled_end: dateStringSchema.optional().nullable(),
});

/**
 * PATCH /api/consultations/:id/cancel - Cancel a consultation
 */
export const cancelConsultationSchema = z.object({
  cancellation_reason: z.string().max(500).trim().optional().default('Cancelled by studio or client'),
});

/**
 * GET /api/consultations - Query schema
 */
export const listConsultationQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  search: z.string().trim().optional(),
  status: consultationStatusEnum.optional(),
  consultation_type: z.string().optional(),
  customer_id: z.string().uuid().optional(),
  enquiry_id: z.string().uuid().optional(),
  booking_id: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * GET /api/consultations/calendar - Calendar query schema
 */
export const consultationCalendarQuerySchema = z.object({
  startDate: z.string().min(1, 'startDate query parameter is required'),
  endDate: z.string().min(1, 'endDate query parameter is required'),
  status: consultationStatusEnum.optional(),
  event_types: z.string().optional(), // Comma-separated: 'CONSULTATION,FOLLOW_UP,BOOKING'
  customer_id: z.string().uuid().optional(),
  view: z.enum(['day', 'week', 'month']).default('month').optional(),
});

/**
 * GET /api/consultations/upcoming - Upcoming query schema
 */
export const upcomingConsultationQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default(10),
  days: z.string().regex(/^\d+$/).transform(Number).optional().default(30),
});

/**
 * POST /api/consultations/:id/outcome - Record a consultation outcome with history & follow-up
 */
export const recordConsultationOutcomeSchema = z.object({
  outcome_tag: z.string().min(1, 'Outcome tag is required').max(100),
  feedback_summary: z.string().trim().optional().nullable(),
  agreed_package: z.string().trim().max(180).optional().nullable(),
  agreed_services: z.string().trim().optional().nullable(),
  estimated_price_paise: z.union([z.number(), z.string()]).optional().nullable(),
  follow_up_date: z.string().optional().nullable(),
  intends_to_proceed: z.boolean().optional().default(false),
});

/**
 * GET /api/consultations/outcomes - Query schema for outcome history & stats
 */
export const listOutcomesQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  search: z.string().trim().optional(),
  outcome_tag: z.string().trim().optional(),
  intends_to_proceed: z.enum(['true', 'false', 'all']).optional(),
  has_follow_up: z.enum(['true', 'false', 'all']).optional(),
  follow_up_status: z.enum(['all', 'upcoming', 'today', 'overdue', 'completed']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

