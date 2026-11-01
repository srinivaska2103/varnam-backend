import { z } from 'zod';

export const createCampaignSchema = z.object({
  name: z.string().trim().min(2, 'Campaign name must be at least 2 characters').max(100),
  subject: z.string().trim().min(3, 'Email subject must be at least 3 characters').max(200),
  heading: z.string().trim().max(150).optional().nullable(),
  body_text: z.string().trim().min(10, 'Campaign body description must be at least 10 characters'),
  banner_url: z
    .string()
    .refine(
      (val) => !val || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:image/'),
      'Banner must be a valid image URL or uploaded file'
    )
    .optional()
    .nullable()
    .or(z.literal('')),
  cta_text: z.string().trim().max(50).optional().nullable().or(z.literal('')),
  cta_url: z.string().url('Call to action must be a valid URL').optional().nullable().or(z.literal('')),
  recipient_segment: z.enum([
    'ALL_CONTACTS',
    'PAST_CUSTOMERS',
    'ENQUIRIES_NOT_BOOKED',
    'SPECIFIC_SERVICE',
    'VIP_CLIENTS',
    'CUSTOMER_DATA_WISE',
  ]).default('ALL_CONTACTS'),
  target_package_id: z.string().uuid().optional().nullable().or(z.literal('')),
  customer_ids: z.array(z.string().uuid()).optional().nullable(),
  scheduled_at: z.string().datetime().optional().nullable().or(z.literal('')),
});

export const updateCampaignSchema = createCampaignSchema.partial();

export const sendTestEmailSchema = z.object({
  test_email: z.string().email('Please provide a valid test email address'),
});

export const sendWhatsAppCampaignSchema = z.object({
  campaign_name: z.string().trim().min(2, 'Campaign name must be at least 2 characters').max(100),
  package_name: z.string().trim().min(2, 'Package name is required').max(180),
  offer_description: z.string().trim().min(3, 'Offer description is required').max(300),
  offer_end_date: z.string().trim().min(3, 'Offer validity end date is required'),
  recipient_segment: z.enum([
    'ALL_CONTACTS',
    'PAST_CUSTOMERS',
    'ENQUIRIES_NOT_BOOKED',
    'SPECIFIC_SERVICE',
    'VIP_CLIENTS',
    'CUSTOMER_DATA_WISE',
  ]).default('ALL_CONTACTS'),
  target_package_id: z.string().uuid().optional().nullable().or(z.literal('')),
  customer_ids: z.array(z.string().uuid()).optional().nullable(),
});

export const previewWhatsAppCampaignSchema = z.object({
  package_name: z.string().trim().optional(),
  offer_description: z.string().trim().optional(),
  offer_end_date: z.string().trim().optional(),
});
