import { z } from 'zod';

// ==========================================
// 1. SERVICES VALIDATORS
// ==========================================

export const createServiceSchema = z.object({
  name: z.string().min(2, 'Service name must be at least 2 characters').max(160, 'Service name cannot exceed 160 characters').trim(),
  description: z.string().max(1000).trim().optional().nullable(),
  default_price_paise: z.union([
    z.number().int().nonnegative('Price in paise must be non-negative'),
    z.string().regex(/^\d+$/, 'Price must be a positive integer').transform((v) => parseInt(v, 10)),
  ]).default(0),
  duration_minutes: z.number().int().positive('Duration must be positive').optional().nullable(),
  is_active: z.boolean().default(true),
});

export const updateServiceSchema = z.object({
  name: z.string().min(2).max(160).trim().optional(),
  description: z.string().max(1000).trim().optional().nullable(),
  default_price_paise: z.union([
    z.number().int().nonnegative('Price in paise must be non-negative'),
    z.string().regex(/^\d+$/, 'Price must be a positive integer').transform((v) => parseInt(v, 10)),
  ]).optional(),
  duration_minutes: z.number().int().positive().optional().nullable(),
  is_active: z.boolean().optional(),
});

export const listServiceQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  search: z.string().trim().optional(),
  is_active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

// ==========================================
// 2. PACKAGES VALIDATORS
// ==========================================

export const createPackageSchema = z.object({
  name: z.string().min(2, 'Package name must be at least 2 characters').max(180, 'Package name cannot exceed 180 characters').trim(),
  slug: z.string().max(180).trim().optional(),
  description: z.string().max(2000).trim().optional().nullable(),
  price_paise: z.union([
    z.number().int().nonnegative('Price in paise must be non-negative'),
    z.string().regex(/^\d+$/, 'Price must be a positive integer').transform((v) => parseInt(v, 10)),
  ]).optional().default(0),
  currency: z.string().length(3).default('INR'),
  is_public: z.boolean().default(false),
  is_active: z.boolean().default(true),
  display_order: z.number().int().default(0),
  cover_image_url: z.string().url('Invalid cover image URL').optional().nullable(),
  // Optional initial list of services to include
  services: z.array(
    z.object({
      service_id: z.string().uuid('Invalid service UUID').optional().nullable(),
      service_name_snapshot: z.string().min(1).max(160).trim().optional(),
      quantity: z.number().int().positive('Quantity must be at least 1').default(1),
      notes: z.string().max(500).trim().optional().nullable(),
    })
  ).optional(),
});

export const updatePackageSchema = z.object({
  name: z.string().min(2).max(180).trim().optional(),
  slug: z.string().max(180).trim().optional(),
  description: z.string().max(2000).trim().optional().nullable(),
  price_paise: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/).transform((v) => parseInt(v, 10)),
  ]).optional(),
  currency: z.string().length(3).optional(),
  is_public: z.boolean().optional(),
  is_active: z.boolean().optional(),
  display_order: z.number().int().optional(),
  cover_image_url: z.string().url().optional().nullable(),
  // Optional updated list of services to associate with the package
  services: z.array(
    z.object({
      service_id: z.string().uuid('Invalid service UUID').optional().nullable(),
      service_name_snapshot: z.string().min(1).max(160).trim().optional(),
      quantity: z.number().int().positive('Quantity must be at least 1').default(1),
      notes: z.string().max(500).trim().optional().nullable(),
    })
  ).optional(),
});

export const addPackageServiceSchema = z.object({
  service_id: z.string().uuid('Invalid service UUID').optional().nullable(),
  service_name_snapshot: z.string().min(1, 'Service name is required').max(160).trim().optional(),
  quantity: z.number().int().positive('Quantity must be at least 1').default(1),
  notes: z.string().max(500).trim().optional().nullable(),
});

export const listPackageQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  search: z.string().trim().optional(),
  is_active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  is_public: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

// ==========================================
// 3. QUOTATIONS VALIDATORS
// ==========================================

export const quotationItemInputSchema = z.object({
  service_id: z.string().uuid('Invalid service UUID').optional().nullable(),
  package_id: z.string().uuid('Invalid package UUID').optional().nullable(),
  description: z.string().min(1, 'Item description is required').max(240).trim(),
  quantity: z.union([
    z.number().positive('Quantity must be positive'),
    z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid quantity').transform(Number),
  ]).default(1),
  unit_price_paise: z.union([
    z.number().int().nonnegative('Unit price must be non-negative'),
    z.string().regex(/^\d+$/).transform((v) => parseInt(v, 10)),
  ]),
});

export const createQuotationSchema = z.object({
  customer_id: z.string().uuid('Invalid customer UUID').optional().nullable(),
  enquiry_id: z.string().uuid('Invalid enquiry UUID').optional().nullable(),
  quotation_number: z.string().max(60).trim().optional(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid until must be in YYYY-MM-DD format').optional().nullable(),
  terms: z.string().max(3000).trim().optional().nullable(),
  discount_paise: z.union([
    z.number().int().nonnegative('Discount must be non-negative'),
    z.string().regex(/^\d+$/).transform((v) => parseInt(v, 10)),
  ]).default(0),
  tax_paise: z.union([
    z.number().int().nonnegative('Tax must be non-negative'),
    z.string().regex(/^\d+$/).transform((v) => parseInt(v, 10)),
  ]).default(0),
  items: z.array(quotationItemInputSchema).min(1, 'Quotation must have at least one line item'),
});

export const updateQuotationSchema = z.object({
  customer_id: z.string().uuid('Invalid customer UUID').optional().nullable(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  terms: z.string().max(3000).trim().optional().nullable(),
  discount_paise: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/).transform((v) => parseInt(v, 10)),
  ]).optional(),
  tax_paise: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/).transform((v) => parseInt(v, 10)),
  ]).optional(),
  items: z.array(quotationItemInputSchema).min(1).optional(),
});

export const updateQuotationStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED']),
});

export const convertQuotationToBookingSchema = z.object({
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Event date must be YYYY-MM-DD format'),
  event_kind: z.enum(['WEDDING', 'ENGAGEMENT', 'RECEPTION', 'SANGEET', 'HALDI', 'MEHENDI', 'TRIAL', 'OTHER']).default('WEDDING'),
  start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, 'Time must be in HH:MM or HH:MM:SS format').optional().nullable(),
  end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, 'Time must be in HH:MM or HH:MM:SS format').optional().nullable(),
  venue: z.string().max(250).trim().optional().nullable(),
  city: z.string().max(100).trim().optional().nullable(),
  instructions: z.string().max(1000).trim().optional().nullable(),
  notes: z.string().max(1000).trim().optional().nullable(),
});

export const listQuotationQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  search: z.string().trim().optional(),
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED']).optional(),
  customer_id: z.string().uuid().optional(),
});
