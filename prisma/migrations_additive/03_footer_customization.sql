-- Migration: Add studio_footer_settings table for customizable website footers
CREATE TABLE IF NOT EXISTS public.studio_footer_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    logo_url TEXT,
    studio_name VARCHAR(180),
    description TEXT,
    layout VARCHAR(30) NOT NULL DEFAULT 'multi_column',
    background_color VARCHAR(20) NOT NULL DEFAULT '#1C1917',
    text_color VARCHAR(20) NOT NULL DEFAULT '#A8A29E',
    accent_color VARCHAR(20) NOT NULL DEFAULT '#F97316',
    copyright_text VARCHAR(255),
    show_logo BOOLEAN NOT NULL DEFAULT true,
    show_social_links BOOLEAN NOT NULL DEFAULT true,
    show_quick_links BOOLEAN NOT NULL DEFAULT true,
    show_contact_info BOOLEAN NOT NULL DEFAULT true,
    show_copyright BOOLEAN NOT NULL DEFAULT true,
    social_links JSONB NOT NULL DEFAULT '[]'::jsonb,
    quick_links JSONB NOT NULL DEFAULT '[]'::jsonb,
    contact_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_studio_footer_settings_biz UNIQUE (business_id)
);

CREATE INDEX IF NOT EXISTS idx_studio_footer_settings_biz ON public.studio_footer_settings(business_id);
