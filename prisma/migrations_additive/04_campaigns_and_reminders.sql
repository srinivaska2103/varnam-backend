-- Migration 04: Campaigns, Unsubscribes and Enhanced Notification Jobs
-- Multi-tenant schema extensions for email campaigns and customer communication preferences

-- 1. Create campaign_status enum if not exists
DO $$ BEGIN
    CREATE TYPE campaign_status AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create recipient_segment enum if not exists
DO $$ BEGIN
    CREATE TYPE recipient_segment AS ENUM ('ALL_CONTACTS', 'PAST_CUSTOMERS', 'ENQUIRIES_NOT_BOOKED', 'SPECIFIC_SERVICE', 'VIP_CLIENTS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Create campaigns table
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name VARCHAR(180) NOT NULL,
    subject VARCHAR(240) NOT NULL,
    sender_name VARCHAR(120),
    heading VARCHAR(180),
    offer_description TEXT,
    body_html TEXT NOT NULL,
    banner_image_url TEXT,
    cta_text VARCHAR(80),
    cta_url TEXT,
    segment recipient_segment NOT NULL DEFAULT 'ALL_CONTACTS',
    segment_filter JSONB DEFAULT '{}'::jsonb,
    scheduled_at TIMESTAMPTZ(6),
    status campaign_status NOT NULL DEFAULT 'DRAFT',
    total_recipients INT NOT NULL DEFAULT 0,
    sent_count INT NOT NULL DEFAULT 0,
    delivered_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    bounced_count INT NOT NULL DEFAULT 0,
    opened_count INT NOT NULL DEFAULT 0,
    clicked_count INT NOT NULL DEFAULT 0,
    unsubscribed_count INT NOT NULL DEFAULT 0,
    sent_at TIMESTAMPTZ(6),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaigns_business ON public.campaigns(business_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(business_id, status);

-- 4. Create marketing_unsubscribes suppression table
CREATE TABLE IF NOT EXISTS public.marketing_unsubscribes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    email VARCHAR(254) NOT NULL,
    reason VARCHAR(255),
    unsubscribed_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_business_unsubscribe_email UNIQUE (business_id, email)
);

CREATE INDEX IF NOT EXISTS idx_unsubscribes_biz_email ON public.marketing_unsubscribes(business_id, email);

-- 5. Add campaign_id, notification_type, and delivery tracking to notification_jobs if missing
ALTER TABLE public.notification_jobs 
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS notification_type VARCHAR(80) DEFAULT 'TRANSACTIONAL',
ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS idx_notification_jobs_campaign ON public.notification_jobs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_notification_jobs_status_due ON public.notification_jobs(status, scheduled_at) WHERE status = 'QUEUED';
