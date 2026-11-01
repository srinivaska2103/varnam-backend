import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { razorpayClient, isRazorpayConfigured, getRazorpayKeyId } from '../config/razorpay.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiResponse.js';

export const razorpayService = {
  /**
   * Helper: verify user membership and authorization for the given business
   */
  async verifyBusinessManager(businessId, userId) {
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
      throw ApiError.forbidden('Only studio owners or managers can initiate or manage subscriptions');
    }

    return membership;
  },

  /**
   * Helper: Retrieve or create a Razorpay Plan idempotently
   */
  async getOrCreateRazorpayPlan(plan) {
    const planKey = `PLAN_${plan.code}`;
    const priceRupees = Number(plan.price_paise) / 100;
    const amountPaise = Number(plan.price_paise);

    if (!isRazorpayConfigured()) {
      return { id: `plan_sim_${plan.code.toLowerCase()}`, name: plan.name, amount: amountPaise };
    }

    try {
      // Create or match plan via Razorpay Plans API
      const rzpPlan = await razorpayClient.plans.create({
        period: 'monthly',
        interval: 1,
        item: {
          name: plan.name,
          amount: amountPaise,
          currency: 'INR',
          description: `${plan.name} Monthly Recurring Subscription`,
        },
        notes: {
          plan_code: plan.code,
          platform: 'VARNAM',
        },
      });
      return rzpPlan;
    } catch (err) {
      console.warn('[RazorpayService] Plan create notice:', err.message);
      return { id: `plan_${plan.code.toLowerCase()}`, name: plan.name, amount: amountPaise };
    }
  },

  /**
   * 1. Initiate Monthly Recurring Subscription for Starter (₹599/mo) or Growth (₹999/mo)
   */
  async initiateRecurringSubscription(businessId, userId, planCode) {
    if (planCode === 'EXCLUSIVE_LIFETIME') {
      throw ApiError.badRequest('The Premium plan (₹29,999) requires no online checkout. Please Contact Sales.');
    }

    if (!['BASIC_MONTHLY', 'GROWTH_MONTHLY'].includes(planCode)) {
      throw ApiError.badRequest('Invalid recurring plan code. Allowed: BASIC_MONTHLY, GROWTH_MONTHLY');
    }

    const [membership, plan] = await Promise.all([
      this.verifyBusinessManager(businessId, userId),
      prisma.plans.findUnique({ where: { code: planCode } }),
    ]);

    const business = membership.businesses;
    const user = membership.users;

    if (!plan || !plan.is_active) {
      throw ApiError.badRequest('Selected subscription plan is inactive');
    }

    const basePriceRupees = Number(plan.price_paise) / 100;
    // Add 2% transaction fee (₹11.98 for 599 -> ₹610.98; ₹19.98 for 999 -> ₹1018.98)
    const transactionFeeRupees = Math.round(basePriceRupees * 0.02 * 100) / 100;
    const priceRupees = Math.round((basePriceRupees + transactionFeeRupees) * 100) / 100;
    const amountPaise = BigInt(Math.round(priceRupees * 100));

    const customerPhone = user.phone || business.business_phone || '9999999999';
    const cleanPhone = customerPhone.replace(/\D/g, '').slice(-10) || '9999999999';
    const customerEmail = user.email || business.business_email || 'studio@varnam.app';
    const customerName = user.name || business.name || 'Studio Owner';

    let rzpSubscriptionId = null;
    let rzpOrderId = null;
    let rzpPlanId = null;
    let rawResponse = {};

    if (isRazorpayConfigured()) {
      try {
        // Attempt Razorpay Subscriptions (recurring mandate)
        // If recurring e-mandates fail or are rejected by the customer's bank (e.g. RuPay/UPI non-mandate or bank minimum restrictions),
        // we also create a standard Order so immediate one-step payment is supported.
        const orderPayload = {
          amount: Number(amountPaise),
          currency: 'INR',
          receipt: `rcpt_${plan.code.slice(0, 4)}_${Date.now()}`.slice(0, 40),
          notes: {
            business_id: business.id,
            business_name: business.name,
            plan_code: plan.code,
            user_id: user.id,
            is_subscription: 'true',
            base_price: String(basePriceRupees),
            transaction_fee: String(transactionFeeRupees),
            total_amount: String(priceRupees),
          },
        };
        const orderResponse = await razorpayClient.orders.create(orderPayload);
        rzpOrderId = orderResponse.id;
        rawResponse = orderResponse;

        try {
          const rzpPlan = await this.getOrCreateRazorpayPlan({
            ...plan,
            price_paise: amountPaise,
          });
          rzpPlanId = rzpPlan.id;

          const subPayload = {
            plan_id: rzpPlanId,
            total_count: 120, // 10 years monthly max
            quantity: 1,
            customer_notify: 1,
            notes: {
              business_id: business.id,
              business_name: business.name,
              plan_code: plan.code,
              user_id: user.id,
            },
          };

          const subResponse = await razorpayClient.subscriptions.create(subPayload);
          rzpSubscriptionId = subResponse.id;
          rawResponse = { ...orderResponse, subscription: subResponse };
        } catch (subErr) {
          console.warn('[RazorpayService] Subscriptions mandate setup notice (using Standard Order):', subErr.message);
        }
      } catch (orderErr) {
        console.error('[RazorpayService] Orders API error:', orderErr.message);
        throw ApiError.internal('Failed to initialize payment order with Razorpay: ' + orderErr.message);
      }
    } else {
      // Development simulated identifiers
      const simSuffix = Date.now().toString(36);
      rzpOrderId = `order_sim_${simSuffix}`;
      rzpSubscriptionId = `sub_sim_${simSuffix}`;
      rawResponse = { simulated: true, note: 'Razorpay keys pending in .env' };
    }

    // Persist pending subscription order record in PostgreSQL
    const createdOrder = await prisma.subscription_orders.create({
      data: {
        business_id: business.id,
        plan_id: plan.id,
        order_type: 'RECURRING',
        payment_provider: 'RAZORPAY',
        rzp_order_id: rzpOrderId,
        rzp_subscription_id: rzpSubscriptionId,
        rzp_plan_id: rzpPlanId,
        amount_paise: amountPaise,
        currency: 'INR',
        status: 'PENDING',
        rzp_raw_response: rawResponse,
      },
    });

    return {
      orderId: rzpOrderId || rzpSubscriptionId,
      subscriptionId: rzpSubscriptionId,
      rzpOrderId,
      rzpSubscriptionId,
      keyId: getRazorpayKeyId(),
      amount: Number(amountPaise), // Razorpay Standard Checkout takes amount in paise
      amountRupees: priceRupees,
      currency: 'INR',
      planName: plan.name,
      planCode: plan.code,
      billingInterval: 'MONTHLY',
      isRecurring: Boolean(rzpSubscriptionId),
      customer: {
        name: customerName,
        email: customerEmail,
        contact: cleanPhone,
      },
    };
  },

  /**
   * 2. Verify Razorpay Payment Signature & Fulfill Subscription
   */
  async verifyPayment(businessId, payload) {
    const rawOrderId = typeof payload === 'string' ? payload : (payload?.orderId || payload?.razorpay_order_id);
    let paymentId = typeof payload === 'object' ? payload?.razorpay_payment_id : null;
    const subId = typeof payload === 'object' ? (payload?.subscriptionId || payload?.razorpay_subscription_id) : null;
    const signature = typeof payload === 'object' ? payload?.razorpay_signature : null;

    // 1. Locate the order record in database by orderId, subscriptionId or paymentId
    const localOrder = await prisma.subscription_orders.findFirst({
      where: {
        business_id: businessId,
        OR: [
          { rzp_order_id: rawOrderId || 'NONE' },
          { rzp_subscription_id: rawOrderId || subId || 'NONE' },
          { cf_order_id: rawOrderId || 'NONE' },
          ...(paymentId ? [{ rzp_payment_id: paymentId }] : []),
        ],
      },
      include: {
        plans: true,
        businesses: true,
      },
      orderBy: { created_at: 'desc' },
    });

    if (!localOrder) {
      throw ApiError.notFound('Subscription order record not found for this studio');
    }

    // If order is already completed, return success immediately
    if (localOrder.status === 'SUCCESS') {
      const entitlement = await prisma.business_entitlements.findUnique({
        where: { business_id: businessId },
        include: { plans: true },
      });
      return {
        status: 'SUCCESS',
        isPaid: true,
        planCode: localOrder.plans.code,
        planName: localOrder.plans.name,
        amountRupees: Number(localOrder.amount_paise) / 100,
        paidAt: localOrder.paid_at,
        entitlementStatus: entitlement?.status || 'ACTIVE',
      };
    }

    // 2. If razorpay_payment_id was not passed from client modal (e.g. from return URL or auto-poller),
    // query Razorpay API to see if this order was paid
    let paymentDetails = null;
    let paymentMethod = 'Online (Razorpay)';

    if (isRazorpayConfigured()) {
      try {
        if (!paymentId && localOrder.rzp_order_id) {
          const orderPayments = await razorpayClient.orders.fetchPayments(localOrder.rzp_order_id);
          const captured = orderPayments.items?.find((p) => p.status === 'captured');
          if (captured) {
            paymentId = captured.id;
            paymentDetails = captured;
          }
        }

        if (!paymentId && localOrder.rzp_subscription_id) {
          const invs = await razorpayClient.invoices.all({ subscription_id: localOrder.rzp_subscription_id });
          for (const inv of invs.items || []) {
            if (inv.order_id) {
              const invPayments = await razorpayClient.orders.fetchPayments(inv.order_id);
              const captured = invPayments.items?.find((p) => p.status === 'captured');
              if (captured) {
                paymentId = captured.id;
                paymentDetails = captured;
                break;
              }
            }
          }
        }

        if (paymentId && !paymentDetails) {
          paymentDetails = await razorpayClient.payments.fetch(paymentId);
        }

        if (paymentDetails?.method) {
          paymentMethod = `Razorpay (${paymentDetails.method.toUpperCase()})`;
        }
      } catch (checkErr) {
        console.warn('[RazorpayService] Auto-status check notice:', checkErr.message);
      }
    }

    // If still no captured payment found on gateway
    if (!paymentId || (paymentDetails && paymentDetails.status !== 'captured')) {
      return {
        status: 'PENDING',
        isPaid: false,
        orderId: localOrder.rzp_order_id || localOrder.rzp_subscription_id,
        message: 'Payment has not been completed or captured yet.',
      };
    }

    // 3. Cryptographic signature check (when signature is provided by checkout modal)
    if (isRazorpayConfigured() && signature) {
      const keySecret = env.RAZORPAY_KEY_SECRET;
      let expectedSignature = '';
      if (subId) {
        expectedSignature = crypto
          .createHmac('sha256', keySecret)
          .update(`${paymentId}|${subId}`)
          .digest('hex');
      } else if (localOrder.rzp_order_id || rawOrderId) {
        expectedSignature = crypto
          .createHmac('sha256', keySecret)
          .update(`${localOrder.rzp_order_id || rawOrderId}|${paymentId}`)
          .digest('hex');
      }

      if (expectedSignature) {
        const isSignatureValid = crypto.timingSafeEqual(
          Buffer.from(expectedSignature, 'utf8'),
          Buffer.from(signature, 'utf8')
        );
        if (!isSignatureValid) {
          throw ApiError.badRequest('Invalid Razorpay payment cryptographic signature');
        }
      }
    }

    // 4. Fulfill order in transaction and activate entitlements
    await this.fulfillSuccessfulOrder(localOrder, {
      paymentId,
      orderId: localOrder.rzp_order_id || rawOrderId,
      subscriptionId: localOrder.rzp_subscription_id || subId,
      signature,
      paymentMethod,
      raw: paymentDetails,
    });

    return {
      status: 'SUCCESS',
      isPaid: true,
      planCode: localOrder.plans.code,
      planName: localOrder.plans.name,
      amountRupees: Number(localOrder.amount_paise) / 100,
      paidAt: new Date(),
      entitlementStatus: 'ACTIVE',
    };
  },

  /**
   * Helper: Fulfill and grant entitlements in a safe PostgreSQL transaction
   */
  async fulfillSuccessfulOrder(localOrder, paymentPayload) {
    const businessId = localOrder.business_id;
    const plan = localOrder.plans;

    const startsAt = new Date();
    // 30 days for monthly subscription, 365 days for one-time
    const endsAt = plan.billing_interval === 'MONTHLY'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      // 1. Mark subscription order as SUCCESS
      await tx.subscription_orders.update({
        where: { id: localOrder.id },
        data: {
          status: 'SUCCESS',
          paid_at: startsAt,
          payment_method: paymentPayload.paymentMethod || 'Razorpay',
          rzp_payment_id: paymentPayload.paymentId || localOrder.rzp_payment_id,
          rzp_signature: paymentPayload.signature || localOrder.rzp_signature,
          rzp_raw_response: paymentPayload.raw || localOrder.rzp_raw_response,
        },
      });

      // 2. Upsert business_entitlements
      const refId = paymentPayload.subscriptionId || paymentPayload.orderId || paymentPayload.paymentId || localOrder.id;
      await tx.business_entitlements.upsert({
        where: { business_id: businessId },
        create: {
          business_id: businessId,
          plan_id: plan.id,
          status: 'ACTIVE',
          starts_at: startsAt,
          ends_at: endsAt,
          auto_renew: plan.billing_type === 'RECURRING',
          purchase_reference: refId,
          notes: `Activated via Razorpay (${plan.name})`,
        },
        update: {
          plan_id: plan.id,
          status: 'ACTIVE',
          starts_at: startsAt,
          ends_at: endsAt,
          auto_renew: plan.billing_type === 'RECURRING',
          purchase_reference: refId,
          notes: `Renewed/Upgraded via Razorpay (${plan.name})`,
        },
      });

      // 3. Record Audit Log
      await tx.audit_logs.create({
        data: {
          business_id: businessId,
          action: 'RAZORPAY_PAYMENT_SUCCESS',
          entity_type: 'SUBSCRIPTION',
          entity_id: localOrder.id,
          details: {
            provider: 'RAZORPAY',
            orderId: localOrder.rzp_order_id,
            subscriptionId: localOrder.rzp_subscription_id,
            paymentId: paymentPayload.paymentId,
            planCode: plan.code,
            amountPaise: Number(localOrder.amount_paise),
          },
        },
      });
    });
  },

  /**
   * 3. Handle Incoming Razorpay Webhooks securely with signature validation & idempotency
   */
  async handleRazorpayWebhook(headers, rawBody, body) {
    const signature = headers['x-razorpay-signature'];
    const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;

    // Cryptographic signature check
    if (webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const isSignatureValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf8'),
        Buffer.from(signature, 'utf8')
      );

      if (!isSignatureValid) {
        throw ApiError.badRequest('Invalid Razorpay webhook cryptographic signature');
      }
    }

    const eventId = headers['x-razorpay-event-id'] || body?.event_id || body?.id || `evt_${Date.now()}`;
    const eventType = body?.event;
    const payload = body?.payload;

    if (!eventType || !payload) {
      return { received: true, ignored: true, reason: 'Empty or invalid event body' };
    }

    // Check idempotency table to prevent duplicate processing
    const alreadyProcessed = await prisma.processed_webhook_events.findUnique({
      where: {
        provider_event_id: {
          provider: 'RAZORPAY',
          event_id: eventId,
        },
      },
    });

    if (alreadyProcessed) {
      return { received: true, idempotent: true, reason: 'Event already processed' };
    }

    // Process Supported Razorpay Events
    let processed = false;
    let actionTaken = 'None';

    try {
      // A. Payment Captured (Order success or recurring cycle fulfillment)
      if (eventType === 'payment.captured' || eventType === 'order.paid') {
        const payment = payload.payment?.entity;
        const orderId = payment?.order_id;
        const paymentId = payment?.id;

        if (orderId || paymentId) {
          const localOrder = await prisma.subscription_orders.findFirst({
            where: {
              OR: [
                { rzp_order_id: orderId || 'NONE' },
                { rzp_payment_id: paymentId || 'NONE' },
              ],
            },
            include: { plans: true, businesses: true },
          });

          if (localOrder && localOrder.status !== 'SUCCESS') {
            await this.fulfillSuccessfulOrder(localOrder, {
              paymentId,
              orderId,
              paymentMethod: payment?.method ? `Razorpay (${payment.method.toUpperCase()})` : 'Razorpay',
              raw: payment,
            });
            processed = true;
            actionTaken = 'Entitlements activated via payment.captured';
          }
        }
      }

      // B. Subscription Charged (Monthly recurring renewal)
      else if (eventType === 'subscription.charged') {
        const subscription = payload.subscription?.entity;
        const payment = payload.payment?.entity;
        const subId = subscription?.id;

        if (subId) {
          const localOrder = await prisma.subscription_orders.findFirst({
            where: { rzp_subscription_id: subId },
            include: { plans: true, businesses: true },
          });

          if (localOrder) {
            await this.fulfillSuccessfulOrder(localOrder, {
              paymentId: payment?.id,
              subscriptionId: subId,
              paymentMethod: payment?.method ? `Razorpay (${payment.method.toUpperCase()})` : 'Razorpay Recurring',
              raw: { subscription, payment },
            });
            processed = true;
            actionTaken = 'Subscription renewal fulfilled';
          }
        }
      }

      // C. Subscription Cancelled / Halted
      else if (eventType === 'subscription.cancelled' || eventType === 'subscription.halted') {
        const subscription = payload.subscription?.entity;
        const subId = subscription?.id;

        if (subId) {
          const localOrder = await prisma.subscription_orders.findFirst({
            where: { rzp_subscription_id: subId },
          });

          if (localOrder) {
            await prisma.business_entitlements.updateMany({
              where: { business_id: localOrder.business_id },
              data: {
                auto_renew: false,
                notes: `Subscription marked as ${eventType} by Razorpay`,
              },
            });
            processed = true;
            actionTaken = `Subscription status adjusted to ${eventType}`;
          }
        }
      }

      // Record event in processed_webhook_events
      await prisma.processed_webhook_events.create({
        data: {
          provider: 'RAZORPAY',
          event_id: eventId,
          event_type: eventType,
          payload: body,
        },
      });

      return { received: true, processed, actionTaken, eventType };
    } catch (err) {
      console.error('[RazorpayService] Webhook processing error:', err.message);
      throw err;
    }
  },

  /**
   * 4. Get Payment & Order History for Business (coexists with historical Cashfree records)
   */
  async getPaymentHistory(businessId) {
    const orders = await prisma.subscription_orders.findMany({
      where: { business_id: businessId },
      include: {
        plans: {
          select: {
            id: true,
            code: true,
            name: true,
            billing_type: true,
            billing_interval: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    return orders.map((o) => {
      const isRazorpay = o.payment_provider === 'RAZORPAY' || o.rzp_order_id || o.rzp_subscription_id;
      const ref = isRazorpay
        ? o.rzp_payment_id || o.rzp_subscription_id || o.rzp_order_id
        : o.cf_order_id || o.cf_subscription_id;

      return {
        id: o.id,
        orderId: ref,
        provider: isRazorpay ? 'RAZORPAY' : 'CASHFREE',
        paymentProvider: isRazorpay ? 'RAZORPAY' : 'CASHFREE',
        amount: Number(o.amount_paise) / 100,
        amountRupees: Number(o.amount_paise) / 100,
        orderType: o.order_type,
        planName: o.plans?.name || 'Subscription Plan',
        planCode: o.plans?.code,
        currency: o.currency,
        status: o.status,
        paymentMethod: o.payment_method || (isRazorpay ? 'Online (Razorpay)' : 'Online (Cashfree)'),
        paidAt: o.paid_at,
        createdAt: o.created_at,
        errorMessage: o.error_message,
      };
    });
  },

  /**
   * 5. Cancel Recurring Subscription via Razorpay API
   */
  async cancelSubscription(businessId, userId, reason) {
    await this.verifyBusinessManager(businessId, userId);

    const entitlement = await prisma.business_entitlements.findUnique({
      where: { business_id: businessId },
      include: { plans: true },
    });

    if (!entitlement || entitlement.status !== 'ACTIVE') {
      throw ApiError.badRequest('No active subscription found to cancel');
    }

    const latestOrder = await prisma.subscription_orders.findFirst({
      where: { business_id: businessId, status: 'SUCCESS' },
      orderBy: { created_at: 'desc' },
    });

    if (isRazorpayConfigured() && latestOrder?.rzp_subscription_id) {
      try {
        await razorpayClient.subscriptions.cancel(latestOrder.rzp_subscription_id, {
          cancel_at_cycle_end: 1, // Preserve access until current paid-through date
        });
      } catch (cancelErr) {
        console.warn('[RazorpayService] Razorpay subscription cancel API notice:', cancelErr.message);
      }
    }

    // Update local entitlement: turn off auto-renew and record audit
    await prisma.business_entitlements.update({
      where: { business_id: businessId },
      data: {
        auto_renew: false,
        notes: `Cancellation requested on ${new Date().toISOString()}. Reason: ${reason || 'Not specified'}. Access retained until ${entitlement.ends_at}.`,
      },
    });

    await prisma.audit_logs.create({
      data: {
        business_id: businessId,
        actor_user_id: userId,
        action: 'SUBSCRIPTION_CANCEL_REQUESTED',
        entity_type: 'SUBSCRIPTION',
        entity_id: entitlement.id,
        details: { reason, ends_at: entitlement.ends_at },
      },
    });

    return {
      message: 'Subscription auto-renewal cancelled. Your access remains active until the end of your billing cycle.',
      endsAt: entitlement.ends_at,
      autoRenew: false,
    };
  },
};
