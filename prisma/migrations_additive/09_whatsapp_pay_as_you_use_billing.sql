-- ==============================================================================
-- Migration: 09_whatsapp_pay_as_you_use_billing.sql
-- Description: Additive migration for prepaid WhatsApp messaging credits,
-- immutable financial ledger, country/category pricing engine, campaign usage tracking,
-- Meta billing arrangements, invoice reconciliation, and settlements.
-- Preserves all existing business, customer, booking, and campaign data.
-- ==============================================================================

-- 1. Create Enums if they do not exist
DO $$ BEGIN
  CREATE TYPE whatsapp_billing_mode AS ENUM (
    'DIRECT_STUDIO_BILLING',
    'CENTRALIZED_VEXA_BILLING'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE whatsapp_message_category AS ENUM (
    'UTILITY',
    'MARKETING',
    'AUTHENTICATION',
    'SERVICE'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE whatsapp_credit_transaction_type AS ENUM (
    'CREDIT_PURCHASE',
    'CAMPAIGN_RESERVATION',
    'CAMPAIGN_USAGE',
    'CAMPAIGN_RELEASE',
    'REFUND',
    'ADMIN_ADJUSTMENT',
    'REVERSAL'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE meta_settlement_status AS ENUM (
    'NOT_RECONCILED',
    'RECONCILIATION_REQUIRED',
    'READY_FOR_PAYMENT',
    'PARTIALLY_PAID',
    'PAID',
    'DISPUTED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Platform-level WhatsApp Billing Configuration (Single-row or Key-Value)
CREATE TABLE IF NOT EXISTS whatsapp_billing_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_mode whatsapp_billing_mode NOT NULL DEFAULT 'DIRECT_STUDIO_BILLING',
  is_live_billing_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by_admin_id UUID REFERENCES users(id) ON UPDATE NO ACTION,
  verified_at TIMESTAMPTZ(6),
  centralized_credit_line_ref VARCHAR(120),
  notes TEXT,
  created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
);

-- Seed default configuration if empty
INSERT INTO whatsapp_billing_configs (billing_mode, is_live_billing_verified, notes)
SELECT 'DIRECT_STUDIO_BILLING', FALSE, 'Default safe non-live state until administrator verifies billing arrangement.'
WHERE NOT EXISTS (SELECT 1 FROM whatsapp_billing_configs);

-- 3. Pricing Configuration (Country code + Message category with rate history)
CREATE TABLE IF NOT EXISTS whatsapp_pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code VARCHAR(10) NOT NULL DEFAULT 'IN',
  category whatsapp_message_category NOT NULL,
  base_rate_paise INT NOT NULL, -- e.g. 11.5 paise stored with scaled precision or integer micro-paise. Storing as paise with decimal support or integer micro-units. Let us use NUMERIC(10, 4) for rupees or INT micro-paise.
  base_rate_rupees NUMERIC(10, 4) NOT NULL, -- e.g. 0.1150
  tax_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 18.00, -- e.g. 18.00
  total_rate_rupees NUMERIC(10, 4) NOT NULL, -- base * (1 + tax) e.g. 0.1357
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  effective_from TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_until TIMESTAMPTZ(6),
  source_note TEXT,
  verification_status VARCHAR(50) NOT NULL DEFAULT 'CONFIGURED_DEFAULT',
  verified_at TIMESTAMPTZ(6),
  verified_by_admin_id UUID REFERENCES users(id) ON UPDATE NO ACTION,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wa_pricing_lookup 
  ON whatsapp_pricing_rules(country_code, category, is_active, effective_from);

-- Seed baseline illustrative defaults for India (Utility & Marketing)
INSERT INTO whatsapp_pricing_rules (country_code, category, base_rate_paise, base_rate_rupees, tax_rate_percent, total_rate_rupees, source_note, verification_status)
SELECT 'IN', 'UTILITY', 12, 0.1150, 18.00, 0.1357, 'Illustrative baseline Meta rate for India utility messages', 'CONFIGURED_DEFAULT'
WHERE NOT EXISTS (SELECT 1 FROM whatsapp_pricing_rules WHERE country_code = 'IN' AND category = 'UTILITY' AND is_active = TRUE);

INSERT INTO whatsapp_pricing_rules (country_code, category, base_rate_paise, base_rate_rupees, tax_rate_percent, total_rate_rupees, source_note, verification_status)
SELECT 'IN', 'MARKETING', 80, 0.7800, 18.00, 0.9204, 'Illustrative baseline Meta rate for India marketing broadcast messages', 'CONFIGURED_DEFAULT'
WHERE NOT EXISTS (SELECT 1 FROM whatsapp_pricing_rules WHERE country_code = 'IN' AND category = 'MARKETING' AND is_active = TRUE);

-- 4. Studio WhatsApp Credit Accounts (Prepaid balance tracking with row-level locking)
CREATE TABLE IF NOT EXISTS whatsapp_credit_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  balance_rupees NUMERIC(12, 4) NOT NULL DEFAULT 0.0000, -- Available spendable balance
  reserved_rupees NUMERIC(12, 4) NOT NULL DEFAULT 0.0000, -- Held for in-flight campaigns
  lifetime_purchased_rupees NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  lifetime_consumed_rupees NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  allow_negative_balance BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wa_credit_acc_biz ON whatsapp_credit_accounts(business_id);

-- 5. Immutable Financial Ledger (Auditable Double-Entry Records)
CREATE TABLE IF NOT EXISTS whatsapp_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES whatsapp_credit_accounts(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  transaction_type whatsapp_credit_transaction_type NOT NULL,
  direction VARCHAR(10) NOT NULL, -- 'CREDIT' (adds to balance) or 'DEBIT' (reduces balance)
  amount_rupees NUMERIC(12, 4) NOT NULL,
  balance_after_rupees NUMERIC(12, 4) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  related_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  related_payment_id VARCHAR(120), -- Razorpay payment ID for credit purchase
  related_order_id VARCHAR(120), -- Razorpay order ID
  pricing_snapshot JSONB DEFAULT '{}', -- Historical copy of base rate, tax %, category at time of transaction
  tax_amount_rupees NUMERIC(10, 4) DEFAULT 0.0000,
  status VARCHAR(40) NOT NULL DEFAULT 'COMPLETED', -- 'COMPLETED', 'PENDING', 'CANCELLED'
  idempotency_key VARCHAR(160) UNIQUE NOT NULL,
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wa_tx_biz_created ON whatsapp_credit_transactions(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_tx_campaign ON whatsapp_credit_transactions(related_campaign_id);
CREATE INDEX IF NOT EXISTS idx_wa_tx_idempotency ON whatsapp_credit_transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_wa_tx_payment ON whatsapp_credit_transactions(related_payment_id);

-- 6. WhatsApp Campaign Usage & Reconciliation Tracking
CREATE TABLE IF NOT EXISTS whatsapp_campaign_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL UNIQUE REFERENCES campaigns(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  message_category whatsapp_message_category NOT NULL DEFAULT 'MARKETING',
  template_name VARCHAR(100) NOT NULL,
  recipient_count INT NOT NULL DEFAULT 0,
  submitted_count INT NOT NULL DEFAULT 0,
  delivered_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  
  -- Financial Estimates
  estimated_base_cost_rupees NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  estimated_tax_rupees NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  estimated_total_cost_rupees NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  
  -- Actual Reconciled Customer Charges
  credits_reserved_rupees NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  credits_charged_rupees NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  credits_released_rupees NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,

  -- Estimated Meta Costs vs Actual Reconciled Meta Costs
  estimated_meta_cost_rupees NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  actual_meta_cost_rupees NUMERIC(12, 4),
  
  pricing_rule_id UUID REFERENCES whatsapp_pricing_rules(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  pricing_snapshot JSONB DEFAULT '{}',
  
  reconciliation_status VARCHAR(50) NOT NULL DEFAULT 'RESERVATION_ACTIVE', -- 'RESERVATION_ACTIVE', 'PARTIALLY_RECONCILED', 'RECONCILED', 'DISPUTED'
  reconciled_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wa_camp_usage_biz ON whatsapp_campaign_usages(business_id);
CREATE INDEX IF NOT EXISTS idx_wa_camp_usage_status ON whatsapp_campaign_usages(reconciliation_status);

-- 7. Meta Invoices (Actual vendor billing documents received from Meta)
CREATE TABLE IF NOT EXISTS meta_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_reference VARCHAR(120) UNIQUE NOT NULL, -- Meta's Invoice ID or statement number
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  invoice_total_rupees NUMERIC(12, 4) NOT NULL,
  tax_amount_rupees NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  amount_paid_rupees NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  outstanding_amount_rupees NUMERIC(12, 4) NOT NULL,
  document_reference VARCHAR(255), -- Cloudinary / storage link to PDF invoice
  reconciliation_status meta_settlement_status NOT NULL DEFAULT 'NOT_RECONCILED',
  notes TEXT,
  recorded_by_admin_id UUID REFERENCES users(id) ON UPDATE NO ACTION,
  created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meta_inv_ref ON meta_invoices(invoice_reference);
CREATE INDEX IF NOT EXISTS idx_meta_inv_period ON meta_invoices(billing_period_start, billing_period_end);

-- 8. Meta Settlements (Payments made to Meta against invoices)
CREATE TABLE IF NOT EXISTS meta_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_invoice_id UUID REFERENCES meta_invoices(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  settlement_reference VARCHAR(120) UNIQUE NOT NULL, -- Bank UTR, Wire Reference, or Card Transaction ID
  payment_date DATE NOT NULL,
  amount_paid_rupees NUMERIC(12, 4) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  payment_method VARCHAR(50) NOT NULL, -- 'BANK_TRANSFER', 'CORPORATE_CARD', 'META_DIRECT_DEBIT'
  status meta_settlement_status NOT NULL DEFAULT 'PAID',
  recorded_by_admin_id UUID NOT NULL REFERENCES users(id) ON UPDATE NO ACTION,
  notes TEXT,
  created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meta_settlement_inv ON meta_settlements(meta_invoice_id);

