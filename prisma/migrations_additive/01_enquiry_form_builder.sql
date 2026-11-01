-- Minimal additive migration for Custom Enquiry Form Builder
-- 1. Create enquiry_forms table
CREATE TABLE IF NOT EXISTS public.enquiry_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
    title VARCHAR(180) NOT NULL DEFAULT 'Bridal Enquiry Form',
    welcome_message TEXT NOT NULL DEFAULT 'Tell us about your special day. Share your details below, and our team will get in touch with you.',
    submit_button_label VARCHAR(60) NOT NULL DEFAULT 'Submit Enquiry',
    success_message TEXT NOT NULL DEFAULT 'Thank you for reaching out! Your enquiry has been received. We will contact you shortly.',
    status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_enquiry_forms_business ON public.enquiry_forms(business_id);

-- 2. Add custom_answers JSONB column to enquiries table if not exists
ALTER TABLE public.enquiries 
ADD COLUMN IF NOT EXISTS custom_answers JSONB DEFAULT '{}'::jsonb;
