import { z } from 'zod';

const paymentMethodEnum = z.enum([
  'CASH',
  'UPI',
  'BANK_TRANSFER',
  'CARD_OFFLINE',
  'OTHER',
]);

const paymentStatusEnum = z.enum([
  'RECORDED',
  'VOIDED',
  'REFUNDED',
  'PENDING_REFUND',
]);

export const recordPaymentSchema = z.object({
  booking_id: z.string().uuid('Booking ID must be a valid UUID'),
  amount_paise: z.coerce.number().int().positive('Payment amount must be greater than zero'),
  method: paymentMethodEnum.default('UPI'),
  status: paymentStatusEnum.default('RECORDED'),
  paid_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  reference_note: z.string().trim().max(180).optional().nullable(),
  receipt_number: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const recordCustomerRefundSchema = z.object({
  booking_id: z.string().uuid('Booking ID must be a valid UUID'),
  refund_amount_paise: z.coerce.number().int().positive('Refund amount must be greater than zero'),
  method: paymentMethodEnum.default('UPI'),
  status: z.enum(['PENDING_REFUND', 'REFUNDED']).default('REFUNDED'),
  refund_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  refund_reference: z.string().trim().max(60).optional(),
  original_payment_id: z.string().uuid().optional().nullable(),
  reference_note: z.string().trim().max(180).optional().nullable(), // Transaction Reference / UTR Number
  reason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  confirm_completed: z.boolean().optional(),
});

export const approveBookingRefundSchema = z.object({
  approved_refundable_paise: z.coerce.number().int().min(0, 'Approved refundable amount cannot be negative'),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  booking_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  method: paymentMethodEnum.optional(),
  status: paymentStatusEnum.optional(),
  type: z.enum(['ALL', 'PAYMENT', 'REFUND']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.enum(['paid_at', 'amount_paise', 'created_at']).default('paid_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const refundPaymentSchema = z.object({
  refund_amount_paise: z.coerce.number().int().positive('Refund amount must be greater than zero').optional(),
  reason: z.string().trim().min(3, 'Refund reason must be at least 3 characters').max(500),
  refund_method: paymentMethodEnum.optional(),
  reference_note: z.string().trim().max(180).optional().nullable(),
});
