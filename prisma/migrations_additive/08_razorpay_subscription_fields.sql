-- ==============================================================================
-- Migration: 08_razorpay_subscription_fields.sql
-- Description: Additive migration for Razorpay subscriptions, orders, and payment records.
-- Preserves all historical Cashfree records intact.
-- ==============================================================================

-- 1. Add Razorpay tracking columns to subscription_orders
ALTER TABLE subscription_orders
  ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(30) DEFAULT 'CASHFREE',
  ADD COLUMN IF NOT EXISTS rzp_order_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS rzp_payment_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS rzp_subscription_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS rzp_plan_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS rzp_signature VARCHAR(255),
  ADD COLUMN IF NOT EXISTS rzp_raw_response JSONB;

-- 2. Add indexes for performance and rapid lookup
CREATE INDEX IF NOT EXISTS idx_subs_orders_rzp_order ON subscription_orders(rzp_order_id);
CREATE INDEX IF NOT EXISTS idx_subs_orders_rzp_sub ON subscription_orders(rzp_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subs_orders_rzp_payment ON subscription_orders(rzp_payment_id);
CREATE INDEX IF NOT EXISTS idx_subs_orders_provider ON subscription_orders(payment_provider);

-- 3. Update existing records with payment_provider = 'CASHFREE' if null
UPDATE subscription_orders
SET payment_provider = 'CASHFREE'
WHERE payment_provider IS NULL;

-- 4. Create processed_webhook_events table for durable idempotency
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(30) NOT NULL,
  event_id VARCHAR(120) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB DEFAULT '{}',
  processed_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_processed_webhooks_provider_event 
  ON processed_webhook_events(provider, event_id);

