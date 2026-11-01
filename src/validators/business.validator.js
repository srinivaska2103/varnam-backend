import { z } from 'zod';
import { isReservedSlug } from '../utils/reservedSlugs.js';

export const createBusinessSchema = z.object({
  name: z.string().trim().min(2, 'Business name must be at least 2 characters').max(180),
  business_phone: z.string().trim().min(7, 'Phone number must be at least 7 digits').max(30).optional().or(z.literal('')),
  business_email: z.string().trim().email('Invalid email address').max(254).optional().or(z.literal('')),
  whatsapp_phone: z.string().trim().max(30).optional().or(z.literal('')),
  address_line1: z.string().trim().max(255).optional().or(z.literal('')),
  address_line2: z.string().trim().max(255).optional().or(z.literal('')),
  city: z.string().trim().max(100).optional().or(z.literal('')),
  state: z.string().trim().max(100).optional().or(z.literal('')),
  postal_code: z.string().trim().max(20).optional().or(z.literal('')),
  country: z.string().trim().length(2, 'Country must be a 2-letter ISO code').default('IN'),
  timezone: z.string().trim().default('Asia/Kolkata'),
  currency: z.string().trim().length(3, 'Currency must be a 3-letter ISO code').default('INR'),
  // Convenience aliases from frontend forms
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

export const updateBusinessSchema = z.object({
  name: z.string().trim().min(2).max(180).optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase letters, numbers, and hyphens')
    .refine(
      (val) => !isReservedSlug(val),
      (val) => ({ message: `'${val}' is a reserved system route and cannot be used as a studio slug` })
    )
    .optional(),
  business_phone: z.string().trim().max(30).optional(),
  business_email: z.string().trim().email().max(254).optional(),
  whatsapp_phone: z.string().trim().max(30).optional(),
  logo_url: z.string().trim().max(5000000).optional().or(z.literal('')),
  address_line1: z.string().trim().max(255).optional(),
  address_line2: z.string().trim().max(255).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postal_code: z.string().trim().max(20).optional(),
  country: z.string().trim().length(2).optional(),
  timezone: z.string().trim().max(80).optional(),
  currency: z.string().trim().length(3).optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  address: z.string().trim().optional(),
});
