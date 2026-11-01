-- Migration: Add business_hours and studio_about_sections tables
-- 1. Create studio_business_hours table
CREATE TABLE IF NOT EXISTS public.studio_business_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 1=Monday, ..., 6=Saturday
    is_closed BOOLEAN NOT NULL DEFAULT false,
    open_time VARCHAR(10) DEFAULT '09:00 AM',
    close_time VARCHAR(10) DEFAULT '08:00 PM',
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_studio_business_hours_day UNIQUE (business_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_studio_business_hours_biz ON public.studio_business_hours(business_id);

-- 2. Create studio_about_sections table (images, description, highlights)
CREATE TABLE IF NOT EXISTS public.studio_about_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    title VARCHAR(180) NOT NULL DEFAULT 'About Our Studio',
    subtitle VARCHAR(240) DEFAULT 'Where Bridal Artistry Meets Timeless Elegance',
    description TEXT,
    experience_years VARCHAR(50) DEFAULT '8+ Years',
    brides_styled VARCHAR(50) DEFAULT '500+ Happy Brides',
    awards_count VARCHAR(50) DEFAULT '15+ Bridal Awards',
    image_url TEXT,
    secondary_image_url TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_studio_about_sections_biz ON public.studio_about_sections(business_id);
