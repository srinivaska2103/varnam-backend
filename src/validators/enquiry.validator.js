import { z } from 'zod';

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

const enquiryStatusEnum = z.enum([
  'NEW',
  'CONTACTED',
  'CONSULTATION',
  'QUOTATION_SENT',
  'FOLLOW_UP',
  'CONVERTED',
  'LOST',
]);

export const createEnquirySchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(180),
  customer_phone: z.string().trim().min(7, 'Phone number must be at least 7 digits').max(30),
  customer_email: z.string().trim().email('Invalid email address').max(254).optional().nullable().or(z.literal('')),
  event_kind: eventTypeEnum.default('WEDDING'),
  event_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional().nullable(),
  event_venue: z.string().trim().max(500).optional().nullable(),
  event_city: z.string().trim().max(100).optional().nullable(),
  guest_count: z.coerce.number().int().nonnegative().optional().nullable(),
  budget_paise: z.coerce.number().int().nonnegative().optional().nullable(),
  source: z.string().trim().max(60).default('MANUAL'),
  source_reference: z.string().trim().max(255).optional().nullable(),
  selected_package_id: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  next_follow_up_at: z.string().datetime().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  custom_answers: z.record(z.any()).optional().nullable(),
});

export const updateEnquirySchema = z.object({
  customer_name: z.string().trim().min(2).max(180).optional(),
  customer_phone: z.string().trim().min(7).max(30).optional(),
  customer_email: z.string().trim().email().max(254).optional().nullable().or(z.literal('')),
  event_kind: eventTypeEnum.optional(),
  event_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional().nullable(),
  event_venue: z.string().trim().max(500).optional().nullable(),
  event_city: z.string().trim().max(100).optional().nullable(),
  guest_count: z.coerce.number().int().nonnegative().optional().nullable(),
  budget_paise: z.coerce.number().int().nonnegative().optional().nullable(),
  source: z.string().trim().max(60).optional(),
  source_reference: z.string().trim().max(255).optional().nullable(),
  selected_package_id: z.string().uuid().optional().nullable(),
  status: enquiryStatusEnum.optional(),
  lost_reason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  next_follow_up_at: z.string().datetime().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  custom_answers: z.record(z.any()).optional().nullable(),
});

/**
 * Form field definition schema
 */
export const formFieldSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1, 'Field label is required').max(180),
  type: z.enum([
    'text',
    'email',
    'phone',
    'textarea',
    'date',
    'select',
    'multiselect',
    'checkbox',
    'image_upload',
  ]),
  required: z.boolean().default(false),
  placeholder: z.string().trim().max(180).optional().nullable(),
  options: z.array(z.string().trim().min(1)).optional().nullable(),
  isSystem: z.boolean().optional(),
});

/**
 * Enquiry form configuration schema
 */
export const enquiryFormConfigSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(180).default('Bridal Enquiry Form'),
  welcome_message: z.string().trim().max(1000).default('Tell us about your special day. Share your details below to schedule your consultation with our bridal studio.'),
  submit_button_label: z.string().trim().min(1).max(60).default('Submit Enquiry'),
  success_message: z.string().trim().max(1000).default('Thank you for reaching out! Your bridal enquiry has been received. Please review your enquiry details or visit our studio for consultation.'),
  status: z.enum(['DRAFT', 'PUBLISHED', 'UNPUBLISHED']).default('PUBLISHED'),
  fields: z.array(formFieldSchema).default([]),
});

/**
 * Public enquiry submission schema
 */
export const publicEnquirySubmissionSchema = z.object({
  customer_name: z.string().trim().min(2, 'Name must be at least 2 characters').max(180),
  customer_phone: z.string().trim().min(7, 'Phone number must be at least 7 digits').max(30),
  customer_email: z.string().trim().email('Invalid email address').max(254).optional().nullable().or(z.literal('')),
  event_kind: eventTypeEnum.optional().default('WEDDING'),
  event_date: z.string().optional().nullable(),
  event_venue: z.string().trim().max(500).optional().nullable(),
  custom_answers: z.record(z.any()).optional().default({}),
});

export const listEnquiryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  status: enquiryStatusEnum.optional(),
  source: z.string().trim().optional(),
  event_kind: eventTypeEnum.optional(),
  fromEventDate: z.string().optional(),
  toEventDate: z.string().optional(),
  sortBy: z.enum(['created_at', 'event_date', 'next_follow_up_at', 'customer_name']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createActivitySchema = z.object({
  activity_type: z.string().trim().min(2, 'Activity type is required').max(60),
  title: z.string().trim().min(2, 'Title is required').max(180),
  details: z.string().trim().max(2000).optional().nullable(),
  due_at: z.string().datetime().optional().nullable(),
  completed_at: z.string().datetime().optional().nullable(),
});

export const followUpQuerySchema = z.object({
  filter: z.enum(['today', 'upcoming', 'overdue', 'completed', 'all']).default('all'),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const convertEnquirySchema = z.object({
  booking_number: z.string().trim().max(60).optional(),
  package_id: z.string().uuid().optional().nullable(),
  package_name_snapshot: z.string().trim().max(180).optional().nullable(),
  total_amount_paise: z.coerce.number().int().nonnegative().optional().nullable(),
  discount_paise: z.coerce.number().int().nonnegative().default(0),
  notes: z.string().trim().max(2000).optional().nullable(),
});
