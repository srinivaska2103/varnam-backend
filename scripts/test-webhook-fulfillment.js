import crypto from 'crypto';
import prisma from '../src/config/prisma.js';
import { cashfreePaymentService } from '../src/services/cashfree.service.js';
import { env } from '../src/config/env.js';

async function testWebhookFulfillment() {
  try {
    const order = await prisma.subscription_orders.findFirst({
      where: { status: 'PENDING' },
      include: { businesses: true, plans: true },
    });

    if (!order) {
      console.log('No pending order found to test fulfillment');
      return;
    }

    console.log(`Testing webhook fulfillment on order ${order.cf_order_id} (Plan: ${order.plans.name})`);

    const webhookPayload = {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: {
          order_id: order.cf_order_id,
          order_amount: Number(order.amount_paise) / 100,
          order_currency: 'INR',
        },
        payment: {
          cf_payment_id: 'cf_sim_test_12345',
          payment_status: 'SUCCESS',
          payment_amount: Number(order.amount_paise) / 100,
          payment_time: new Date().toISOString(),
        },
      },
    };

    const rawBody = JSON.stringify(webhookPayload);
    const timestamp = Date.now().toString();
    const signature = crypto
      .createHmac('sha256', env.CASHFREE_SECRET_KEY)
      .update(timestamp + rawBody)
      .digest('base64');

    const headers = {
      'x-webhook-signature': signature,
      'x-webhook-timestamp': timestamp,
    };

    console.log('Simulating incoming verified webhook...');
    const result = await cashfreePaymentService.handleCashfreeWebhook(headers, rawBody, webhookPayload);
    console.log('Webhook result:', result);

    const updatedOrder = await prisma.subscription_orders.findUnique({
      where: { id: order.id },
    });
    console.log('Order status after webhook:', updatedOrder.status, 'Paid at:', updatedOrder.paid_at);

    const entitlement = await prisma.business_entitlements.findUnique({
      where: { business_id: order.business_id },
      include: { plans: true },
    });
    console.log('Entitlement active plan:', entitlement?.plans?.name, 'Status:', entitlement?.status);

    console.log('Testing duplicate webhook delivery idempotency...');
    const duplicateResult = await cashfreePaymentService.handleCashfreeWebhook(headers, rawBody, webhookPayload);
    console.log('Duplicate webhook result:', duplicateResult);

  } catch (err) {
    console.error('Webhook test error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testWebhookFulfillment();
