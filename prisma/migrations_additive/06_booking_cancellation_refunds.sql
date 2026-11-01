-- Migration 06: Additive migration for Booking Cancellation Refunds and Approvals
-- 1. Add approved_refundable_paise to bookings table to track studio-approved refund liability
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS approved_refundable_paise BIGINT NOT NULL DEFAULT 0;

-- 2. Add refund_approval_notes to bookings table for cancellation policy audit notes
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS refund_approval_notes TEXT;

-- 3. Add approved_by to bookings table
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS refund_approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- 4. Add refund_approved_at to bookings table
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS refund_approved_at TIMESTAMPTZ(6);

-- 5. Add PENDING_REFUND to payment_status enum if not already present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid 
        WHERE t.typname = 'payment_status' AND e.enumlabel = 'PENDING_REFUND'
    ) THEN
        ALTER TYPE public.payment_status ADD VALUE 'PENDING_REFUND';
    END IF;
END $$;
