-- Migration 07: WhatsApp Templates, Tracking and Parameters
-- Non-destructive additive extension to notification_jobs for WhatsApp integration

ALTER TABLE public.notification_jobs 
ADD COLUMN IF NOT EXISTS template_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS template_params JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS channel_response JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_notification_jobs_channel ON public.notification_jobs(business_id, channel);
CREATE INDEX IF NOT EXISTS idx_notification_jobs_template ON public.notification_jobs(business_id, template_name);

