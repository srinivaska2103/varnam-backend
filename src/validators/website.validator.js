import { z } from 'zod';
import { isReservedSlug } from '../utils/reservedSlugs.js';

// Slug regex: lowercase letters, numbers, and hyphens (3 to 60 characters)
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Hex color regex (#RGB or #RRGGBB)
const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

// Helper to sanitize empty strings or strings containing only whitespace to null
const emptyToNull = (val) => {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string' && val.trim() === '') return null;
  return typeof val === 'string' ? val.trim() : val;
};

// Helper to sanitize optional empty string to undefined
const emptyToUndefined = (val) => {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'string' && val.trim() === '') return undefined;
  return typeof val === 'string' ? val.trim() : val;
};

/**
 * Validator for creating or updating a business website configuration
 */
export const upsertWebsiteSchema = z.object({
  subdomain: z
    .preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .toLowerCase()
        .min(3, 'Slug must be at least 3 characters')
        .max(60, 'Slug must not exceed 60 characters')
        .regex(slugRegex, 'Slug must contain only lowercase letters, numbers, and hyphens (e.g. "luxe-bridal-studio")')
        .refine(
          (val) => !isReservedSlug(val),
          (val) => ({ message: `'${val}' is a reserved system route and cannot be used as a studio slug` })
        )
        .optional()
    ),
  site_title: z.preprocess(emptyToNull, z.string().trim().max(180, 'Site title must not exceed 180 characters').nullable().optional()),
  tagline: z.preprocess(emptyToNull, z.string().trim().max(240, 'Tagline must not exceed 240 characters').nullable().optional()),
  about_text: z.preprocess(emptyToNull, z.string().trim().max(5000, 'About text must not exceed 5000 characters').nullable().optional()),
  contact_email: z.preprocess(emptyToNull, z.string().trim().email('Invalid contact email').max(254).nullable().optional()),
  contact_phone: z.preprocess(emptyToNull, z.string().trim().max(30, 'Phone must not exceed 30 characters').nullable().optional()),
  whatsapp_phone: z.preprocess(emptyToNull, z.string().trim().max(30, 'WhatsApp phone must not exceed 30 characters').nullable().optional()),
  public_address: z.preprocess(emptyToNull, z.string().trim().max(500, 'Public address must not exceed 500 characters').nullable().optional()),
  map_url: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .refine((val) => !val || /^https?:\/\//i.test(val), { message: 'Invalid map URL' })
      .nullable()
      .optional()
  ),
  primary_color: z.preprocess(
    (val) => (val && typeof val === 'string' && val.trim() !== '' ? val.trim() : '#F97316'),
    z.string().regex(hexColorRegex, 'Invalid hex color (e.g. #D4AF37)').optional()
  ),
  logo_url: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .refine(
        (val) => !val || val.startsWith('/') || /^https?:\/\//i.test(val) || val.startsWith('data:image/'),
        { message: 'Logo must be a valid image URL, relative path, or uploaded image' }
      )
      .nullable()
      .optional()
  ),
  seo_title: z.preprocess(emptyToNull, z.string().trim().max(180, 'SEO title must not exceed 180 characters').nullable().optional()),
  seo_description: z.preprocess(emptyToNull, z.string().trim().max(320, 'SEO description must not exceed 320 characters').nullable().optional()),
  custom_domain: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .toLowerCase()
      .max(255)
      .regex(/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,10}$/, 'Invalid domain format (e.g. "bridalstudio.com")')
      .nullable()
      .optional()
  ),
});

/**
 * Validator for portfolio item creation
 */
export const createPortfolioSchema = z.object({
  title: z.string().trim().max(180, 'Title must not exceed 180 characters').optional().nullable(),
  description: z.string().trim().max(1000, 'Description must not exceed 1000 characters').optional().nullable(),
  image_url: z
    .string()
    .trim()
    .min(1, 'Image URL or photo file is required')
    .refine(
      (val) => val.startsWith('data:image/') || /^https?:\/\//.test(val),
      'Must be a valid web URL (http/https) or uploaded image file'
    ),
  category: z.string().trim().max(100, 'Category must not exceed 100 characters').optional().nullable(),
  display_order: z.number().int().min(0).default(0),
  is_public: z.boolean().default(true),
});

/**
 * Validator for portfolio item update
 */
export const updatePortfolioSchema = z.object({
  title: z.string().trim().max(180).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
  image_url: z
    .string()
    .trim()
    .min(1)
    .refine(
      (val) => val.startsWith('data:image/') || /^https?:\/\//.test(val),
      'Must be a valid web URL (http/https) or uploaded image file'
    )
    .optional(),
  category: z.string().trim().max(100).optional().nullable(),
  display_order: z.number().int().min(0).optional(),
  is_public: z.boolean().optional(),
});

/**
 * Validator for public website enquiry submission
 */
export const publicEnquirySchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const customer_name = raw.customer_name || raw.name || '';
    const customer_phone = raw.customer_phone || raw.phone || '';
    const customer_email = raw.customer_email || raw.email || null;

    let event_kind = (raw.event_kind || raw.event_type || 'WEDDING').toString().toUpperCase();
    if (event_kind === 'BRIDAL') event_kind = 'WEDDING';
    const validKinds = ['WEDDING', 'RECEPTION', 'ENGAGEMENT', 'MEHENDI', 'SANGEET', 'HALDI', 'EDITORIAL', 'PARTY', 'OTHER'];
    if (!validKinds.includes(event_kind)) event_kind = 'WEDDING';

    let event_date = raw.event_date || null;
    if (typeof event_date === 'string' && event_date.trim()) {
      const trimmedDate = event_date.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
        event_date = trimmedDate;
      } else {
        const dt = new Date(trimmedDate);
        if (!isNaN(dt.getTime())) {
          const y = dt.getFullYear();
          const m = String(dt.getMonth() + 1).padStart(2, '0');
          const d = String(dt.getDate()).padStart(2, '0');
          event_date = `${y}-${m}-${d}`;
        }
      }
    }

    return {
      ...raw,
      customer_name,
      customer_phone,
      customer_email: customer_email && customer_email.trim() !== '' ? customer_email.trim() : null,
      event_kind,
      event_date: event_date || null,
      location: raw.location || null,
      message: raw.message || null,
      service_interested: raw.service_interested || null,
    };
  },
  z.object({
    customer_name: z.string().trim().min(2, 'Name must be at least 2 characters').max(180),
    customer_phone: z.string().trim().min(7, 'Phone number must be at least 7 digits').max(30),
    customer_email: z.string().trim().email('Invalid email address').max(254).optional().nullable(),
    event_kind: z.enum(['WEDDING', 'RECEPTION', 'ENGAGEMENT', 'MEHENDI', 'SANGEET', 'HALDI', 'EDITORIAL', 'PARTY', 'OTHER']).default('WEDDING'),
    event_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'event_date must be in YYYY-MM-DD format')
      .optional()
      .nullable(),
    location: z.string().trim().max(240).optional().nullable(),
    selected_package_id: z.string().uuid('Invalid package ID').optional().nullable(),
    selected_service_id: z.string().uuid('Invalid service ID').optional().nullable(),
    message: z.string().trim().max(2000, 'Message cannot exceed 2000 characters').optional().nullable(),
    // Accepted aliases from frontend
    name: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    email: z.string().trim().optional().nullable(),
    event_type: z.string().trim().optional(),
    service_interested: z.string().trim().optional().nullable(),
  })
);

/**
 * Validator for public website consultation request
 */
export const publicConsultationSchema = z.object({
  requested_name: z.string().trim().min(2, 'Name must be at least 2 characters').max(180),
  requested_phone: z.string().trim().min(7, 'Phone number must be at least 7 digits').max(30),
  requested_email: z.string().trim().email('Invalid email address').max(254).optional().nullable(),
  consultation_type: z.enum(['IN_PERSON', 'VIRTUAL', 'PHONE']).default('IN_PERSON'),
  preferred_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'preferred_date must be in YYYY-MM-DD format')
    .optional()
    .nullable(),
  preferred_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/, 'preferred_time must be in HH:mm or HH:mm:ss format')
    .optional()
    .nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

/**
 * Validator for business hours array
 */
export const updateBusinessHoursSchema = z.object({
  hours: z.array(
    z.object({
      day_of_week: z.number().int().min(0).max(6),
      is_closed: z.boolean().default(false),
      open_time: z.string().trim().max(20).optional().nullable(),
      close_time: z.string().trim().max(20).optional().nullable(),
    })
  ),
});

/**
 * Validator for studio about section
 */
export const upsertStudioAboutSchema = z.object({
  title: z.preprocess(emptyToNull, z.string().trim().max(180).nullable().optional()),
  subtitle: z.preprocess(emptyToNull, z.string().trim().max(240).nullable().optional()),
  description: z.preprocess(emptyToNull, z.string().trim().max(10000).nullable().optional()),
  experience_years: z.preprocess(emptyToNull, z.string().trim().max(50).nullable().optional()),
  brides_styled: z.preprocess(emptyToNull, z.string().trim().max(50).nullable().optional()),
  awards_count: z.preprocess(emptyToNull, z.string().trim().max(50).nullable().optional()),
  image_url: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
  secondary_image_url: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
  is_active: z.boolean().optional(),
});

/**
 * Validator for website footer settings
 */
const hexColorRegexOptional = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

export const upsertFooterSettingsSchema = z.object({
  logo_url: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .refine(
        (val) => !val || val.startsWith('/') || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:image/'),
        { message: 'Logo must be a valid web URL or uploaded image' }
      )
      .nullable()
      .optional()
  ),
  studio_name: z.preprocess(emptyToNull, z.string().trim().max(180, 'Studio name must not exceed 180 characters').nullable().optional()),
  description: z.preprocess(emptyToNull, z.string().trim().max(1000, 'Description must not exceed 1000 characters').nullable().optional()),
  layout: z.enum(['classic', 'centered', 'multi_column']).default('multi_column'),
  background_color: z.preprocess(
    (val) => (val && typeof val === 'string' && val.trim() !== '' ? val.trim() : '#1C1917'),
    z.string().regex(hexColorRegexOptional, 'Invalid background hex color')
  ),
  text_color: z.preprocess(
    (val) => (val && typeof val === 'string' && val.trim() !== '' ? val.trim() : '#A8A29E'),
    z.string().regex(hexColorRegexOptional, 'Invalid text hex color')
  ),
  accent_color: z.preprocess(
    (val) => (val && typeof val === 'string' && val.trim() !== '' ? val.trim() : '#F97316'),
    z.string().regex(hexColorRegexOptional, 'Invalid accent hex color')
  ),
  copyright_text: z.preprocess(emptyToNull, z.string().trim().max(255).nullable().optional()),
  show_logo: z.boolean().default(true),
  show_social_links: z.boolean().default(true),
  show_quick_links: z.boolean().default(true),
  show_contact_info: z.boolean().default(true),
  show_copyright: z.boolean().default(true),
  social_links: z
    .array(
      z.object({
        platform: z.enum(['instagram', 'facebook', 'youtube', 'whatsapp', 'pinterest', 'linkedin']),
        url: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string().max(500)),
        enabled: z.boolean().default(true),
      })
    )
    .default([]),
  quick_links: z
    .array(
      z.object({
        id: z.string().trim().optional(),
        label: z.string().trim().min(1, 'Link label is required').max(100),
        url: z.string().trim().min(1, 'Link destination is required').max(500),
        enabled: z.boolean().default(true),
      })
    )
    .default([]),
  contact_settings: z
    .object({
      phone: z.preprocess(emptyToNull, z.string().trim().max(30).optional().nullable()),
      show_phone: z.boolean().default(true),
      email: z.preprocess(emptyToNull, z.string().trim().max(254).optional().nullable()),
      show_email: z.boolean().default(true),
      address: z.preprocess(emptyToNull, z.string().trim().max(500).optional().nullable()),
      show_address: z.boolean().default(true),
      map_url: z.preprocess(emptyToNull, z.string().trim().max(1000).optional().nullable()),
      show_map: z.boolean().default(true),
      show_hours: z.boolean().default(true),
    })
    .default({}),
});

