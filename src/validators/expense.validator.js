import { z } from 'zod';

const expenseStatusEnum = z.enum([
  'RECORDED',
  'VOIDED',
]);

export const createExpenseSchema = z.object({
  category: z.string().trim().min(2, 'Category must be at least 2 characters').max(100),
  description: z.string().trim().min(3, 'Description must be at least 3 characters').max(240),
  amount_paise: z.coerce.number().int().positive('Expense amount must be greater than zero'),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'expense_date must be YYYY-MM-DD').optional(),
  vendor_name: z.string().trim().max(180).optional().nullable(),
  receipt_url: z.string().trim().max(5000000).optional().nullable().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: expenseStatusEnum.default('RECORDED'),
});

export const updateExpenseSchema = z.object({
  category: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().min(3).max(240).optional(),
  amount_paise: z.coerce.number().int().positive().optional(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  vendor_name: z.string().trim().max(180).optional().nullable(),
  receipt_url: z.string().trim().max(5000000).optional().nullable().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: expenseStatusEnum.optional(),
});

export const listExpenseQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  status: expenseStatusEnum.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.enum(['expense_date', 'amount_paise', 'created_at']).default('expense_date'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const financialReportQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
