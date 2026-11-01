import { z } from 'zod';

export const createCustomerSchema = z.object({
  full_name: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(180),
  phone: z.string().trim().min(7, 'Phone number must be at least 7 digits').max(30),
  email: z.string().trim().email('Invalid email address').max(254).optional().or(z.literal('')),
  alternate_phone: z.string().trim().max(30).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  city: z.string().trim().max(100).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  // Compatibility alias
  name: z.string().trim().optional(),
});

export const updateCustomerSchema = z.object({
  full_name: z.string().trim().min(2).max(180).optional(),
  name: z.string().trim().min(2).max(180).optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  email: z.string().trim().email('Invalid email address').max(254).optional().or(z.literal('')),
  alternate_phone: z.string().trim().max(30).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  city: z.string().trim().max(100).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

export const listCustomerQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  city: z.string().trim().optional(),
  includeArchived: z.preprocess((val) => val === 'true' || val === true, z.boolean().default(false)),
  sortBy: z.enum(['created_at', 'full_name', 'updated_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
