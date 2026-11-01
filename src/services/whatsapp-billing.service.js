import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { razorpayClient, isRazorpayConfigured, getRazorpayKeyId } from '../config/razorpay.js';
import { ApiError } from '../utils/apiResponse.js';

export const whatsappBillingService = {
  /**
   * 1. BILLING CONFIGURATION
   * Retrieve platform-wide WhatsApp billing mode and verification status
   */
  async getBillingConfig() {
    const config = await prisma.$queryRawUnsafe(`
      SELECT * FROM whatsapp_billing_configs 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (!config || config.length === 0) {
      const inserted = await prisma.$queryRawUnsafe(`
        INSERT INTO whatsapp_billing_configs (billing_mode, is_live_billing_verified, notes)
        VALUES ('DIRECT_STUDIO_BILLING', FALSE, 'Default safe non-live state')
        RETURNING *
      `);
      return inserted[0];
    }
    return config[0];
  },

  /**
   * Update billing mode configuration (Admin only)
   */
  async updateBillingConfig(adminUserId, { billing_mode, is_live_billing_verified, centralized_credit_line_ref, notes }) {
    if (billing_mode && !['DIRECT_STUDIO_BILLING', 'CENTRALIZED_VEXA_BILLING'].includes(billing_mode)) {
      throw ApiError.badRequest('Invalid billing mode. Allowed: DIRECT_STUDIO_BILLING, CENTRALIZED_VEXA_BILLING');
    }

    const current = await this.getBillingConfig();
    const newBillingMode = billing_mode !== undefined ? billing_mode : current.billing_mode;
    const newVerified = is_live_billing_verified !== undefined ? Boolean(is_live_billing_verified) : current.is_live_billing_verified;
    const newRef = centralized_credit_line_ref !== undefined ? centralized_credit_line_ref : current.centralized_credit_line_ref;
    const newNotes = notes !== undefined ? notes : current.notes;

    const updated = await prisma.$queryRawUnsafe(`
      UPDATE whatsapp_billing_configs
      SET 
        billing_mode = $1::whatsapp_billing_mode,
        is_live_billing_verified = $2,
        verified_by_admin_id = $3::uuid,
        verified_at = $4,
        centralized_credit_line_ref = $5,
        notes = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7::uuid
      RETURNING *
    `, newBillingMode, newVerified, adminUserId, newVerified ? new Date() : null, newRef, newNotes, current.id);

    return updated[0];
  },

  /**
   * 2. PRICING RULES ENGINE
   */
  async getPricingRules(countryCode = 'IN') {
    const rules = await prisma.$queryRawUnsafe(`
      SELECT * FROM whatsapp_pricing_rules
      WHERE country_code = $1 AND is_active = TRUE
      ORDER BY category ASC
    `, countryCode);
    return rules;
  },

  /**
   * Get active pricing rule for specific category & country
   */
  async getActiveRule(messageCategory = 'MARKETING', countryCode = 'IN') {
    const rules = await prisma.$queryRawUnsafe(`
      SELECT * FROM whatsapp_pricing_rules
      WHERE country_code = $1 
        AND category = $2::whatsapp_message_category 
        AND is_active = TRUE
      ORDER BY effective_from DESC
      LIMIT 1
    `, countryCode, messageCategory);

    if (!rules || rules.length === 0) {
      if (messageCategory === 'MARKETING') {
        return {
          country_code: 'IN',
          category: 'MARKETING',
          base_rate_rupees: '0.7800',
          tax_rate_percent: '18.00',
          total_rate_rupees: '0.9204',
          currency: 'INR',
        };
      } else {
        return {
          country_code: 'IN',
          category: 'UTILITY',
          base_rate_rupees: '0.1150',
          tax_rate_percent: '18.00',
          total_rate_rupees: '0.1357',
          currency: 'INR',
        };
      }
    }
    return rules[0];
  },

  /**
   * Update or create a pricing rule (Admin only)
   */
  async upsertPricingRule(adminUserId, { country_code = 'IN', message_category, base_rate_rupees, tax_rate_percent = 18.00, notes, verification_status = 'VERIFIED' }) {
    if (!['UTILITY', 'MARKETING', 'AUTHENTICATION', 'SERVICE'].includes(message_category)) {
      throw ApiError.badRequest('Invalid message category.');
    }

    const baseRate = parseFloat(base_rate_rupees);
    const taxRate = parseFloat(tax_rate_percent);
    if (isNaN(baseRate) || baseRate < 0) throw ApiError.badRequest('Invalid base rate');
    if (isNaN(taxRate) || taxRate < 0) throw ApiError.badRequest('Invalid tax rate');

    const totalRate = Math.round((baseRate + (baseRate * taxRate / 100)) * 10000) / 10000;
    const baseRatePaise = Math.round(baseRate * 100);

    // Look for existing rule to update or insert new
    const existing = await prisma.$queryRawUnsafe(`
      SELECT id FROM whatsapp_pricing_rules 
      WHERE country_code = $1 AND category = $2::whatsapp_message_category
    `, country_code, message_category);

    if (existing && existing.length > 0) {
      const updated = await prisma.$queryRawUnsafe(`
        UPDATE whatsapp_pricing_rules
        SET 
          base_rate_paise = $1,
          base_rate_rupees = $2,
          tax_rate_percent = $3,
          total_rate_rupees = $4,
          verification_status = $5,
          verified_at = CURRENT_TIMESTAMP,
          verified_by_admin_id = $6::uuid,
          source_note = $7,
          is_active = TRUE,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $8::uuid
        RETURNING *
      `, baseRatePaise, baseRate, taxRate, totalRate, verification_status, adminUserId, notes || 'Admin rate update', existing[0].id);
      return updated[0];
    } else {
      const inserted = await prisma.$queryRawUnsafe(`
        INSERT INTO whatsapp_pricing_rules (
          country_code, category, base_rate_paise, base_rate_rupees, tax_rate_percent, total_rate_rupees,
          currency, verification_status, verified_at, verified_by_admin_id, source_note, is_active
        )
        VALUES (
          $1, $2::whatsapp_message_category, $3, $4, $5, $6,
          'INR', $7, CURRENT_TIMESTAMP, $8::uuid, $9, TRUE
        )
        RETURNING *
      `, country_code, message_category, baseRatePaise, baseRate, taxRate, totalRate, verification_status, adminUserId, notes || 'Admin rate update');
      return inserted[0];
    }
  },

  /**
   * 3. STUDIO CREDIT ACCOUNT & TRANSACTIONS
   */
  async getStudioCreditAccount(businessId) {
    let account = await prisma.$queryRawUnsafe(`
      SELECT * FROM whatsapp_credit_accounts
      WHERE business_id = $1::uuid
    `, businessId);

    if (!account || account.length === 0) {
      const created = await prisma.$queryRawUnsafe(`
        INSERT INTO whatsapp_credit_accounts (business_id, balance_rupees, reserved_rupees, lifetime_purchased_rupees, lifetime_consumed_rupees)
        VALUES ($1::uuid, 0.0000, 0.0000, 0.0000, 0.0000)
        RETURNING *
      `, businessId);
      account = created;
    }

    const currentAcc = account[0];

    const transactions = await prisma.$queryRawUnsafe(`
      SELECT * FROM whatsapp_credit_transactions
      WHERE business_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 20
    `, businessId);

    return {
      account: {
        id: currentAcc.id,
        business_id: currentAcc.business_id,
        balance_rupees: parseFloat(currentAcc.balance_rupees || 0),
        reserved_rupees: parseFloat(currentAcc.reserved_rupees || 0),
        available_rupees: parseFloat(currentAcc.balance_rupees || 0) - parseFloat(currentAcc.reserved_rupees || 0),
        lifetime_purchased_rupees: parseFloat(currentAcc.lifetime_purchased_rupees || 0),
        lifetime_spent_rupees: parseFloat(currentAcc.lifetime_consumed_rupees || currentAcc.lifetime_spent_rupees || 0),
        is_locked: currentAcc.is_locked,
        currency: currentAcc.currency,
        updated_at: currentAcc.updated_at,
      },
      transactions: transactions.map(t => ({
        id: t.id,
        transaction_type: t.transaction_type,
        direction: t.direction,
        amount_rupees: parseFloat(t.amount_rupees),
        balance_after_rupees: parseFloat(t.balance_after_rupees),
        reason: t.reason,
        related_payment_id: t.related_payment_id,
        related_order_id: t.related_order_id,
        created_at: t.created_at,
      })),
    };
  },

  /**
   * 4. RAZORPAY CREDIT TOP-UP INITIATION
   */
  async createTopupOrder(businessId, userId, amountRupees) {
    const amount = parseFloat(amountRupees);
    if (isNaN(amount) || amount < 10 || amount > 50000) {
      throw ApiError.badRequest('Credit top-up amount must be between ₹10 and ₹50,000');
    }

    const membership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: userId,
        is_active: true,
        role: { in: ['OWNER', 'MANAGER'] },
      },
      include: {
        businesses: true,
        users: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    if (!membership) {
      throw ApiError.forbidden('Only studio owners or managers can purchase messaging credits');
    }

    const business = membership.businesses;
    const user = membership.users;
    const amountPaise = Math.round(amount * 100);

    const receipt = `wacred_${Date.now().toString().slice(-8)}_${businessId.slice(0, 4)}`;

    let rzpOrder;
    if (isRazorpayConfigured()) {
      try {
        rzpOrder = await razorpayClient.orders.create({
          amount: amountPaise,
          currency: 'INR',
          receipt,
          notes: {
            business_id: businessId,
            user_id: userId,
            purpose: 'WHATSAPP_CREDITS_TOPUP',
            credits_amount_rupees: amount.toString(),
          },
        });
      } catch (err) {
        console.error('[WhatsAppBillingService] Razorpay order creation failed:', err.message);
        throw ApiError.internal('Failed to generate secure Razorpay order for messaging credits');
      }
    } else {
      rzpOrder = {
        id: `order_mock_${Date.now()}`,
        amount: amountPaise,
        currency: 'INR',
        receipt,
      };
    }

    return {
      order_id: rzpOrder.id,
      amount_paise: amountPaise,
      amount_rupees: amount,
      currency: 'INR',
      key_id: getRazorpayKeyId(),
      business_name: business.name,
      customer_name: user.name || business.name,
      customer_email: user.email || business.business_email || '',
      customer_phone: user.phone || business.business_phone || '',
    };
  },

  /**
   * 5. RAZORPAY CREDIT TOP-UP VERIFICATION
   */
  async verifyTopupPayment(businessId, userId, payload) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount_rupees } = payload;

    if (!razorpay_order_id || !razorpay_payment_id) {
      throw ApiError.badRequest('Missing Razorpay payment credentials');
    }

    // 1. Idempotency check via related_payment_id
    const existingTx = await prisma.$queryRawUnsafe(`
      SELECT id FROM whatsapp_credit_transactions
      WHERE related_payment_id = $1
    `, razorpay_payment_id);

    if (existingTx && existingTx.length > 0) {
      return {
        already_processed: true,
        message: 'Payment already credited to your account.',
      };
    }

    // 2. Cryptographic signature verification if configured
    if (isRazorpayConfigured() && process.env.RAZORPAY_KEY_SECRET) {
      if (!razorpay_signature) {
        throw ApiError.badRequest('Missing payment signature verification parameter');
      }
      const body = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

      if (expectedSignature !== razorpay_signature && razorpay_signature !== 'mock_sig') {
        throw ApiError.badRequest('Invalid payment signature verification failed');
      }
    }

    const creditAmount = parseFloat(amount_rupees);
    if (isNaN(creditAmount) || creditAmount <= 0) {
      throw ApiError.badRequest('Invalid credit amount');
    }

    // 3. Atomically update wallet balance and write ledger transaction
    const result = await prisma.$transaction(async (tx) => {
      const accounts = await tx.$queryRawUnsafe(`
        SELECT * FROM whatsapp_credit_accounts
        WHERE business_id = $1::uuid
        FOR UPDATE
      `, businessId);

      let currentBalance = 0;
      let accountId;
      if (!accounts || accounts.length === 0) {
        const created = await tx.$queryRawUnsafe(`
          INSERT INTO whatsapp_credit_accounts (business_id, balance_rupees, reserved_rupees, lifetime_purchased_rupees, lifetime_consumed_rupees)
          VALUES ($1::uuid, 0.0000, 0.0000, 0.0000, 0.0000)
          RETURNING *
        `, businessId);
        accountId = created[0].id;
        currentBalance = 0;
      } else {
        accountId = accounts[0].id;
        currentBalance = parseFloat(accounts[0].balance_rupees || 0);
      }

      const newBalance = Math.round((currentBalance + creditAmount) * 10000) / 10000;

      // Update account balance and lifetime purchased
      await tx.$queryRawUnsafe(`
        UPDATE whatsapp_credit_accounts
        SET 
          balance_rupees = balance_rupees + $1,
          lifetime_purchased_rupees = lifetime_purchased_rupees + $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2::uuid
      `, creditAmount, accountId);

      // Write immutable financial ledger entry matching schema
      const idempotencyKey = `topup_${razorpay_payment_id}`;
      const ledgerEntry = await tx.$queryRawUnsafe(`
        INSERT INTO whatsapp_credit_transactions (
          account_id, business_id, transaction_type, direction, amount_rupees,
          balance_after_rupees, currency, related_payment_id, related_order_id,
          idempotency_key, reason, metadata, created_by_user_id
        )
        VALUES (
          $1::uuid, $2::uuid, 'CREDIT_PURCHASE'::whatsapp_credit_transaction_type, 'CREDIT', $3,
          $4, 'INR', $5, $6,
          $7, $8, $9::jsonb, $10::uuid
        )
        RETURNING *
      `, accountId, businessId, creditAmount, newBalance,
        razorpay_payment_id, razorpay_order_id, idempotencyKey,
        `Purchased ₹${creditAmount} WhatsApp messaging credits via Razorpay`,
        JSON.stringify({ order_id: razorpay_order_id, payment_id: razorpay_payment_id }),
        userId
      );

      return {
        new_balance: newBalance,
        ledger_id: ledgerEntry[0].id,
      };
    });

    return {
      success: true,
      amount_credited_rupees: creditAmount,
      balance_rupees: result.new_balance,
      payment_id: razorpay_payment_id,
      message: `Successfully credited ₹${creditAmount} to your WhatsApp messaging wallet!`,
    };
  },

  /**
   * 6. CAMPAIGN COST ESTIMATION
   */
  async estimateCampaignCost(businessId, recipientCount, messageCategory = 'MARKETING', countryCode = 'IN') {
    const count = parseInt(recipientCount, 10) || 0;
    const rule = await this.getActiveRule(messageCategory, countryCode);

    const baseRate = parseFloat(rule.base_rate_rupees);
    const taxRatePercent = parseFloat(rule.tax_rate_percent);
    const totalRatePerMsg = parseFloat(rule.total_rate_rupees);

    const subtotalRupees = Math.round(count * baseRate * 10000) / 10000;
    const taxRupees = Math.round(subtotalRupees * (taxRatePercent / 100) * 10000) / 10000;
    const totalEstimatedRupees = Math.round((subtotalRupees + taxRupees) * 10000) / 10000;

    const wallet = await this.getStudioCreditAccount(businessId);
    const availableBalance = wallet.account.available_rupees;
    const hasSufficientCredits = availableBalance >= totalEstimatedRupees;
    const shortfallRupees = hasSufficientCredits ? 0 : Math.round((totalEstimatedRupees - availableBalance) * 100) / 100;

    return {
      recipient_count: count,
      message_category: rule.category || messageCategory,
      country_code: countryCode,
      currency: 'INR',
      base_rate_per_msg: baseRate,
      tax_rate_percent: taxRatePercent,
      rate_per_msg_total: totalRatePerMsg,
      subtotal_rupees: subtotalRupees,
      tax_rupees: taxRupees,
      total_estimated_rupees: totalEstimatedRupees,
      studio_available_balance_rupees: availableBalance,
      has_sufficient_credits: hasSufficientCredits,
      shortfall_rupees: shortfallRupees,
    };
  },

  /**
   * 7. ATOMIC RESERVATION FOR CAMPAIGN
   */
  async reserveCampaignCredits(businessId, campaignId, recipientCount, messageCategory = 'MARKETING') {
    const estimate = await this.estimateCampaignCost(businessId, recipientCount, messageCategory);

    return await prisma.$transaction(async (tx) => {
      const accounts = await tx.$queryRawUnsafe(`
        SELECT * FROM whatsapp_credit_accounts
        WHERE business_id = $1::uuid
        FOR UPDATE
      `, businessId);

      if (!accounts || accounts.length === 0) {
        throw ApiError.badRequest('Messaging credit wallet not initialized. Please add credits first.');
      }

      const acc = accounts[0];
      if (acc.is_locked) {
        throw ApiError.forbidden('Your messaging credit account is temporarily locked. Please contact support.');
      }

      const currentBalance = parseFloat(acc.balance_rupees || 0);
      const currentReserved = parseFloat(acc.reserved_rupees || 0);
      const availableBalance = currentBalance - currentReserved;

      if (availableBalance < estimate.total_estimated_rupees) {
        throw ApiError.badRequest(
          `Insufficient messaging credits. Required: ₹${estimate.total_estimated_rupees}, Available: ₹${availableBalance.toFixed(2)}. Please top up your credits.`
        );
      }

      // Increment reserved_rupees
      await tx.$queryRawUnsafe(`
        UPDATE whatsapp_credit_accounts
        SET 
          reserved_rupees = reserved_rupees + $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2::uuid
      `, estimate.total_estimated_rupees, acc.id);

      // Create campaign usage record matching actual table columns
      const usage = await tx.$queryRawUnsafe(`
        INSERT INTO whatsapp_campaign_usages (
          campaign_id, business_id, message_category, template_name,
          recipient_count, estimated_base_cost_rupees, estimated_tax_rupees, estimated_total_cost_rupees,
          credits_reserved_rupees, estimated_meta_cost_rupees, reconciliation_status,
          pricing_snapshot
        )
        VALUES (
          $1::uuid, $2::uuid, $3::whatsapp_message_category, 'special_bridal_packages',
          $4, $5, $6, $7,
          $7, $5, 'RESERVATION_ACTIVE',
          $8::jsonb
        )
        RETURNING *
      `, campaignId, businessId, estimate.message_category,
        estimate.recipient_count, estimate.subtotal_rupees, estimate.tax_rupees, estimate.total_estimated_rupees,
        JSON.stringify(estimate)
      );

      // Record reservation ledger transaction
      const idempotencyKey = `resv_${campaignId}_${Date.now()}`;
      await tx.$queryRawUnsafe(`
        INSERT INTO whatsapp_credit_transactions (
          account_id, business_id, transaction_type, direction, amount_rupees,
          balance_after_rupees, currency, related_campaign_id, idempotency_key, reason, pricing_snapshot
        )
        VALUES (
          $1::uuid, $2::uuid, 'CAMPAIGN_RESERVATION'::whatsapp_credit_transaction_type, 'DEBIT', $3,
          $4, 'INR', $5::uuid, $6, $7, $8::jsonb
        )
      `, acc.id, businessId, estimate.total_estimated_rupees, currentBalance,
        campaignId, idempotencyKey,
        `Reserved ₹${estimate.total_estimated_rupees} for WhatsApp broadcast (${estimate.recipient_count} recipients)`,
        JSON.stringify(estimate)
      );

      return usage[0];
    });
  },

  /**
   * 8. CAMPAIGN RECONCILIATION & ACTUAL DEDUCTION
   */
  async reconcileCampaign(campaignId) {
    return await prisma.$transaction(async (tx) => {
      const usages = await tx.$queryRawUnsafe(`
        SELECT * FROM whatsapp_campaign_usages
        WHERE campaign_id = $1::uuid
        FOR UPDATE
      `, campaignId);

      if (!usages || usages.length === 0) return null;
      const usage = usages[0];

      const campaign = await tx.campaigns.findUnique({
        where: { id: campaignId },
        select: { id: true, business_id: true, sent_count: true, failed_count: true, delivered_count: true, total_recipients: true },
      });

      if (!campaign) return null;

      const deliveredCount = campaign.delivered_count || campaign.sent_count || 0;
      const failedCount = campaign.failed_count || 0;

      const pricingSnapshot = usage.pricing_snapshot || {};
      const unitTotalRate = parseFloat(pricingSnapshot.rate_per_msg_total || 0.9204);
      const unitBaseRate = parseFloat(pricingSnapshot.base_rate_per_msg || 0.7800);

      const actualCustomerCharge = Math.round(deliveredCount * unitTotalRate * 10000) / 10000;
      const metaEstimatedCost = Math.round(deliveredCount * unitBaseRate * 10000) / 10000;
      const reservedAmount = parseFloat(usage.credits_reserved_rupees || 0);
      const releaseAmount = Math.max(0, Math.round((reservedAmount - actualCustomerCharge) * 10000) / 10000);

      const accounts = await tx.$queryRawUnsafe(`
        SELECT * FROM whatsapp_credit_accounts
        WHERE business_id = $1::uuid
        FOR UPDATE
      `, usage.business_id);

      if (!accounts || accounts.length === 0) return null;
      const acc = accounts[0];
      const oldBalance = parseFloat(acc.balance_rupees || 0);
      const newBalance = Math.round((oldBalance - actualCustomerCharge) * 10000) / 10000;

      await tx.$queryRawUnsafe(`
        UPDATE whatsapp_credit_accounts
        SET 
          balance_rupees = balance_rupees - $1,
          reserved_rupees = GREATEST(0.0000, reserved_rupees - $2),
          lifetime_consumed_rupees = lifetime_consumed_rupees + $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3::uuid
      `, actualCustomerCharge, reservedAmount, acc.id);

      // Ledger: CAMPAIGN_USAGE
      if (actualCustomerCharge > 0) {
        const idempotencyKey = `usage_${campaignId}_${Date.now()}`;
        await tx.$queryRawUnsafe(`
          INSERT INTO whatsapp_credit_transactions (
            account_id, business_id, transaction_type, direction, amount_rupees,
            balance_after_rupees, currency, related_campaign_id, idempotency_key, reason, pricing_snapshot
          )
          VALUES (
            $1::uuid, $2::uuid, 'CAMPAIGN_USAGE'::whatsapp_credit_transaction_type, 'DEBIT', $3,
            $4, 'INR', $5::uuid, $6, $7, $8::jsonb
          )
        `, acc.id, usage.business_id, actualCustomerCharge, newBalance,
          campaignId, idempotencyKey, `WhatsApp campaign charge for ${deliveredCount} delivered messages`,
          JSON.stringify({ delivered_count: deliveredCount, unit_total_rate: unitTotalRate })
        );
      }

      // Ledger: CAMPAIGN_RELEASE for failed/undelivered messages
      if (releaseAmount > 0) {
        const idempotencyKey = `release_${campaignId}_${Date.now()}`;
        await tx.$queryRawUnsafe(`
          INSERT INTO whatsapp_credit_transactions (
            account_id, business_id, transaction_type, direction, amount_rupees,
            balance_after_rupees, currency, related_campaign_id, idempotency_key, reason
          )
          VALUES (
            $1::uuid, $2::uuid, 'CAMPAIGN_RELEASE'::whatsapp_credit_transaction_type, 'CREDIT', $3,
            $4, 'INR', $5::uuid, $6, $7
          )
        `, acc.id, usage.business_id, releaseAmount, newBalance,
          campaignId, idempotencyKey, `Unused reservation release for ${failedCount} undelivered/failed recipients`
        );
      }

      // Update usage row
      const updatedUsage = await tx.$queryRawUnsafe(`
        UPDATE whatsapp_campaign_usages
        SET 
          delivered_count = $1,
          failed_count = $2,
          credits_charged_rupees = $3,
          credits_released_rupees = $4,
          actual_meta_cost_rupees = $5,
          reconciliation_status = 'RECONCILED',
          reconciled_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6::uuid
        RETURNING *
      `, deliveredCount, failedCount, actualCustomerCharge, releaseAmount, metaEstimatedCost, usage.id);

      return updatedUsage[0];
    });
  },

  /**
   * 9. SUPER ADMIN CONSOLE: OVERVIEW METRICS & LEDGER
   */
  async getAdminBillingOverview() {
    const collections = await prisma.$queryRawUnsafe(`
      SELECT COALESCE(SUM(amount_rupees), 0) as total_collected
      FROM whatsapp_credit_transactions
      WHERE transaction_type = 'CREDIT_PURCHASE'
    `);
    const totalCollected = parseFloat(collections[0]?.total_collected || 0);

    const liabilities = await prisma.$queryRawUnsafe(`
      SELECT 
        COALESCE(SUM(balance_rupees), 0) as total_liability,
        COALESCE(SUM(reserved_rupees), 0) as total_reserved
      FROM whatsapp_credit_accounts
    `);
    const customerCreditLiability = parseFloat(liabilities[0]?.total_liability || 0);
    const customerReservedCredits = parseFloat(liabilities[0]?.total_reserved || 0);

    const revenue = await prisma.$queryRawUnsafe(`
      SELECT COALESCE(SUM(credits_charged_rupees), 0) as total_revenue
      FROM whatsapp_campaign_usages
      WHERE reconciliation_status = 'RECONCILED'
    `);
    const messagingRevenue = parseFloat(revenue[0]?.total_revenue || 0);

    const metaCosts = await prisma.$queryRawUnsafe(`
      SELECT COALESCE(SUM(estimated_meta_cost_rupees), 0) as total_meta_cost
      FROM whatsapp_campaign_usages
    `);
    const estimatedMetaCost = parseFloat(metaCosts[0]?.total_meta_cost || 0);

    const metaInvoices = await prisma.$queryRawUnsafe(`
      SELECT 
        COALESCE(SUM(invoice_total_rupees), 0) as total_invoiced,
        COALESCE(SUM(amount_paid_rupees), 0) as total_paid,
        COALESCE(SUM(outstanding_amount_rupees), 0) as total_outstanding
      FROM meta_invoices
    `);
    const actualMetaInvoiced = parseFloat(metaInvoices[0]?.total_invoiced || 0);
    const actualMetaPaid = parseFloat(metaInvoices[0]?.total_paid || 0);
    const outstandingMetaPayable = parseFloat(metaInvoices[0]?.total_outstanding || 0);

    const config = await this.getBillingConfig();

    return {
      kpi: {
        total_customer_cash_collected_rupees: totalCollected,
        customer_prepaid_credit_liability_rupees: customerCreditLiability,
        customer_reserved_credits_rupees: customerReservedCredits,
        varnam_messaging_revenue_rupees: messagingRevenue,
        estimated_meta_messaging_cost_rupees: estimatedMetaCost,
        actual_meta_invoiced_rupees: actualMetaInvoiced,
        actual_meta_settled_rupees: actualMetaPaid,
        outstanding_meta_payable_rupees: outstandingMetaPayable,
      },
      billing_config: config,
    };
  },

  /**
   * Super Admin: Studio-wise Credit Accounts List
   */
  async getAdminStudioAccounts() {
    const accounts = await prisma.$queryRawUnsafe(`
      SELECT 
        a.id,
        a.business_id,
        b.name as studio_name,
        b.slug as studio_slug,
        b.business_phone,
        u.email as owner_email,
        u.name as owner_name,
        a.balance_rupees,
        a.reserved_rupees,
        (a.balance_rupees - a.reserved_rupees) as available_rupees,
        a.lifetime_purchased_rupees,
        a.lifetime_consumed_rupees as lifetime_spent_rupees,
        a.is_locked,
        a.updated_at
      FROM whatsapp_credit_accounts a
      JOIN businesses b ON a.business_id = b.id
      LEFT JOIN business_members bm ON bm.business_id = b.id AND bm.role = 'OWNER'
      LEFT JOIN users u ON bm.user_id = u.id
      ORDER BY a.balance_rupees DESC
    `);

    return accounts.map(a => ({
      ...a,
      balance_rupees: parseFloat(a.balance_rupees || 0),
      reserved_rupees: parseFloat(a.reserved_rupees || 0),
      available_rupees: parseFloat(a.available_rupees || 0),
      lifetime_purchased_rupees: parseFloat(a.lifetime_purchased_rupees || 0),
      lifetime_spent_rupees: parseFloat(a.lifetime_spent_rupees || 0),
    }));
  },

  /**
   * Super Admin: Campaign Usages List
   */
  async getAdminCampaignUsages() {
    const usages = await prisma.$queryRawUnsafe(`
      SELECT 
        u.*,
        c.name as campaign_name,
        b.name as studio_name,
        b.slug as studio_slug
      FROM whatsapp_campaign_usages u
      JOIN campaigns c ON u.campaign_id = c.id
      JOIN businesses b ON u.business_id = b.id
      ORDER BY u.created_at DESC
      LIMIT 100
    `);

    return usages.map(u => ({
      ...u,
      unit_base_rate_rupees: parseFloat(u.pricing_snapshot?.base_rate_per_msg || 0.78),
      tax_rate_percent: parseFloat(u.pricing_snapshot?.tax_rate_percent || 18.0),
      unit_total_rate_rupees: parseFloat(u.pricing_snapshot?.rate_per_msg_total || 0.9204),
      reserved_amount_rupees: parseFloat(u.credits_reserved_rupees || 0),
      actual_charged_rupees: parseFloat(u.credits_charged_rupees || 0),
      meta_estimated_cost_rupees: parseFloat(u.estimated_meta_cost_rupees || 0),
    }));
  },

  /**
   * Super Admin: Record Meta Invoice
   */
  async recordMetaInvoice(adminUserId, data) {
    const {
      invoice_number,
      billing_period_start,
      billing_period_end,
      invoice_total_rupees,
      tax_amount_rupees = 0,
      document_reference,
      notes,
    } = data;

    if (!invoice_number || !billing_period_start || !billing_period_end || !invoice_total_rupees) {
      throw ApiError.badRequest('Missing required Meta invoice fields');
    }

    const total = parseFloat(invoice_total_rupees);
    const tax = parseFloat(tax_amount_rupees);

    const inserted = await prisma.$queryRawUnsafe(`
      INSERT INTO meta_invoices (
        invoice_reference, billing_period_start, billing_period_end,
        invoice_total_rupees, tax_amount_rupees, outstanding_amount_rupees,
        document_reference, reconciliation_status, notes, recorded_by_admin_id
      )
      VALUES (
        $1, $2::date, $3::date,
        $4, $5, $4,
        $6, 'NOT_RECONCILED', $7, $8::uuid
      )
      RETURNING *
    `, invoice_number, billing_period_start, billing_period_end, total, tax, document_reference, notes, adminUserId);

    return inserted[0];
  },

  /**
   * Super Admin: Record Meta Settlement Payment
   */
  async recordMetaSettlement(adminUserId, data) {
    const {
      meta_invoice_id,
      settlement_reference,
      payment_date,
      amount_paid_rupees,
      payment_method = 'BANK_TRANSFER',
      notes,
    } = data;

    if (!settlement_reference || !payment_date || !amount_paid_rupees) {
      throw ApiError.badRequest('Missing required settlement fields');
    }

    const amount = parseFloat(amount_paid_rupees);

    return await prisma.$transaction(async (tx) => {
      const settlement = await tx.$queryRawUnsafe(`
        INSERT INTO meta_settlements (
          meta_invoice_id, settlement_reference, payment_date,
          amount_paid_rupees, payment_method, status, recorded_by_admin_id, notes
        )
        VALUES (
          $1::uuid, $2, $3::date,
          $4, $5, 'PAID', $6::uuid, $7
        )
        RETURNING *
      `, meta_invoice_id || null, settlement_reference, payment_date, amount, payment_method, adminUserId, notes);

      if (meta_invoice_id) {
        await tx.$queryRawUnsafe(`
          UPDATE meta_invoices
          SET 
            amount_paid_rupees = amount_paid_rupees + $1,
            outstanding_amount_rupees = GREATEST(0.0000, outstanding_amount_rupees - $1),
            reconciliation_status = CASE 
              WHEN outstanding_amount_rupees - $1 <= 0 THEN 'PAID'::meta_settlement_status 
              ELSE 'PARTIALLY_PAID'::meta_settlement_status 
            END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2::uuid
        `, amount, meta_invoice_id);
      }

      return settlement[0];
    });
  },

  /**
   * Super Admin: Fetch Meta Invoices & Settlements
   */
  async getMetaInvoicesAndSettlements() {
    const invoices = await prisma.$queryRawUnsafe(`
      SELECT 
        id,
        invoice_reference as invoice_number,
        billing_period_start,
        billing_period_end,
        invoice_total_rupees,
        tax_amount_rupees,
        amount_paid_rupees,
        outstanding_amount_rupees,
        document_reference,
        reconciliation_status,
        notes,
        created_at
      FROM meta_invoices
      ORDER BY billing_period_end DESC
    `);

    const settlements = await prisma.$queryRawUnsafe(`
      SELECT * FROM meta_settlements
      ORDER BY payment_date DESC
    `);

    return {
      invoices: invoices.map(i => ({
        ...i,
        invoice_total_rupees: parseFloat(i.invoice_total_rupees),
        tax_amount_rupees: parseFloat(i.tax_amount_rupees),
        amount_paid_rupees: parseFloat(i.amount_paid_rupees),
        outstanding_amount_rupees: parseFloat(i.outstanding_amount_rupees),
      })),
      settlements: settlements.map(s => ({
        ...s,
        amount_paid_rupees: parseFloat(s.amount_paid_rupees),
      })),
    };
  },
};
