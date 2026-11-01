import { z } from 'zod';

export const stockMovementTypeEnum = z.enum([
  'PURCHASE',
  'USAGE',
  'ADJUSTMENT',
  'RETURN',
  'WASTE',
]);

/**
 * Inventory Item Schemas
 */
export const createInventoryItemSchema = z.object({
  name: z.string().min(2, 'Item name must be at least 2 characters').max(180).trim(),
  sku: z.string().max(100).trim().optional().nullable(),
  category: z.string().max(100).trim().optional().nullable(),
  unit: z.string().max(30).trim().default('unit'),
  quantity_on_hand: z.coerce.number().min(0, 'Quantity cannot be negative').default(0),
  minimum_quantity: z.coerce.number().min(0, 'Minimum quantity cannot be negative').default(0),
  unit_cost_paise: z.union([
    z.number().int().nonnegative('Unit cost must be non-negative'),
    z.string().regex(/^\d+$/).transform(Number),
  ]).default(0),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  is_active: z.boolean().default(true),
});

export const updateInventoryItemSchema = z.object({
  name: z.string().min(2).max(180).trim().optional(),
  sku: z.string().max(100).trim().optional().nullable(),
  category: z.string().max(100).trim().optional().nullable(),
  unit: z.string().max(30).trim().optional(),
  minimum_quantity: z.coerce.number().min(0).optional(),
  unit_cost_paise: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/).transform(Number),
  ]).optional(),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  is_active: z.boolean().optional(),
});

export const listInventoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  is_active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  low_stock_only: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  stock_status: z.enum(['all', 'in_stock', 'low_stock', 'out_of_stock']).optional(),
  sortBy: z.enum(['name', 'quantity', 'recent', 'updated_at', 'created_at']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

/**
 * Stock Movements Schemas
 */
export const stockInSchema = z.object({
  quantity: z.coerce.number().positive('Quantity received must be greater than zero'),
  unit_cost_paise: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/).transform(Number),
  ]).optional(),
  reason: z.string().max(500).trim().optional(),
});

export const stockOutSchema = z.object({
  quantity: z.coerce.number().positive('Quantity removed must be greater than zero'),
  reason: z.string().max(500).trim().optional(),
  booking_id: z.string().uuid('Invalid booking UUID').optional().nullable(),
  movement_type: z.enum(['USAGE', 'WASTE', 'RETURN']).default('USAGE'),
  idempotency_key: z.string().max(100).trim().optional(),
});

export const stockAdjustmentSchema = z.object({
  counted_quantity: z.coerce.number().min(0, 'Physical count quantity cannot be negative'),
  reason: z.string().min(1, 'Reason for stock adjustment is required').max(500).trim(),
});

export const listMovementsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  inventory_item_id: z.string().uuid().optional(),
  movement_type: stockMovementTypeEnum.optional(),
  booking_id: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
