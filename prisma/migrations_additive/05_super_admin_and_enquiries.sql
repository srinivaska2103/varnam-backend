-- Migration 05: Super Admin System Role and Premium Enquiries Table
-- 1. Add is_super_admin column to users table with DEFAULT FALSE
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_super_admin ON public.users(is_super_admin) WHERE is_super_admin = TRUE;

-- 2. Create premium_sales_enquiries table for dedicated Premium plan enquiries
CREATE TABLE IF NOT EXISTS public.premium_sales_enquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
    studio_name VARCHAR(180) NOT NULL,
    contact_person VARCHAR(180) NOT NULL,
    email VARCHAR(254) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    requested_plan VARCHAR(100) NOT NULL DEFAULT 'Premium — ₹29,999 (EXCLUSIVE_LIFETIME)',
    status VARCHAR(50) NOT NULL DEFAULT 'NEW', -- NEW, CONTACTED, IN_NEGOTIATION, CONVERTED, CLOSED_LOST
    requirements TEXT,
    notes TEXT,
    follow_up_date DATE,
    assigned_admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prem_enquiries_status ON public.premium_sales_enquiries(status);
CREATE INDEX IF NOT EXISTS idx_prem_enquiries_created ON public.premium_sales_enquiries(created_at DESC);
