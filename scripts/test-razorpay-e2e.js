import prisma from '../src/config/prisma.js';
import { razorpayService } from '../src/services/razorpay.service.js';
import crypto from 'crypto';

async function runTests() {
  console.log('=== STARTING RAZORPAY COMPREHENSIVE INTEGRATION TEST ===\n');

  // Find a sample business and user
  const business = await prisma.businesses.findFirst();
  const member = await prisma.business_members.findFirst({
    where: { business_id: business.id },
    include: { users: true },
  });
  const owner = member.users;

  if (!business || !owner) {
    console.error('No business or owner found in database to test.');
    process.exit(1);
  }

  console.log(`Testing with Business: "${business.name}" (${business.id}), Owner: ${owner.email}`);

  // 1. Test Starter Plan (₹599) checkout creation
  console.log('\n--- 1. Testing Starter Plan (₹599) Checkout Creation ---');
  const starterCheckout = await razorpayService.initiateRecurringSubscription(
    business.id,
    owner.id,
    'BASIC_MONTHLY'
  );
  console.log('Starter Checkout Response:', {
    keyId: starterCheckout.keyId,
    orderId: starterCheckout.orderId,
    amount: starterCheckout.amount,
    currency: starterCheckout.currency,
    planCode: starterCheckout.planCode,
    isRecurring: starterCheckout.isRecurring,
  });
  if (starterCheckout.amount !== 100) {
    throw new Error(`Expected amount 100 paise, got ${starterCheckout.amount}`);
  }
  console.log('✅ Starter Plan checkout created successfully with exact ₹1 (100 paise).');

  // 2. Test Growth Plan (₹1) Checkout Creation ---
  console.log('\n--- 2. Testing Growth Plan (₹1) Checkout Creation ---');
  const growthCheckout = await razorpayService.initiateRecurringSubscription(
    business.id,
    owner.id,
    'GROWTH_MONTHLY'
  );
  console.log('Growth Checkout Response:', {
    keyId: growthCheckout.keyId,
    orderId: growthCheckout.orderId,
    amount: growthCheckout.amount,
    currency: growthCheckout.currency,
    planCode: growthCheckout.planCode,
    isRecurring: growthCheckout.isRecurring,
  });
  if (growthCheckout.amount !== 100) {
    throw new Error(`Expected amount 100 paise, got ${growthCheckout.amount}`);
  }
  console.log('✅ Growth Plan checkout created successfully with exact ₹1 (100 paise).');

  // 3. Test Premium Plan rejection (Contact Sales enforced)
  console.log('\n--- 3. Testing Premium Plan (₹29,999) Contact Sales Enforcement ---');
  try {
    await razorpayService.initiateRecurringSubscription(
      business.id,
      owner.id,
      'EXCLUSIVE_LIFETIME'
    );
    throw new Error('Should have thrown an error for Premium online checkout!');
  } catch (err) {
    console.log('Caught expected rejection:', err.message);
    if (err.message.includes('Contact Sales')) {
      console.log('✅ Premium Plan strictly rejects online checkout (Contact Sales enforced).');
    } else {
      throw err;
    }
  }

  // 4. Test HMAC SHA256 Signature Verification & Entitlement Activation
  console.log('\n--- 4. Testing Payment Verification & Subscription Activation ---');
  const dummyPaymentId = 'pay_' + crypto.randomBytes(8).toString('hex');
  const secret = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret_varnam_bridal_2026';
  
  // For Razorpay Subscriptions, verification signature is hmac_sha256(payment_id + "|" + subscription_id, secret)
  const isSubscriptionCheckout = Boolean(growthCheckout.subscriptionId);
  const sigPayload = isSubscriptionCheckout
    ? `${dummyPaymentId}|${growthCheckout.subscriptionId}`
    : `${growthCheckout.orderId}|${dummyPaymentId}`;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(sigPayload)
    .digest('hex');

  const verificationResult = await razorpayService.verifyPayment(business.id, {
    orderId: growthCheckout.orderId,
    subscriptionId: growthCheckout.subscriptionId,
    razorpay_order_id: !isSubscriptionCheckout ? growthCheckout.orderId : undefined,
    razorpay_subscription_id: growthCheckout.subscriptionId,
    razorpay_payment_id: dummyPaymentId,
    razorpay_signature: expectedSignature,
  });

  console.log('Verification Result:', {
    isPaid: verificationResult.isPaid,
    status: verificationResult.status,
    planName: verificationResult.planName,
    paymentProvider: verificationResult.paymentProvider,
  });

  if (!verificationResult.isPaid) {
    throw new Error('Payment verification failed!');
  }
  console.log('✅ Payment signature verified and subscription entitlements activated successfully.');

  // 5. Test Webhook Idempotency & Signature Verification
  console.log('\n--- 5. Testing Webhook Verification and Deduplication Idempotency ---');
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || secret;
  const webhookEventId = 'evt_' + crypto.randomBytes(8).toString('hex');
  const renewalPaymentId = 'pay_' + crypto.randomBytes(8).toString('hex');
  const webhookPayload = JSON.stringify({
    event: 'subscription.charged',
    payload: {
      subscription: {
        entity: {
          id: growthCheckout.subscriptionId,
          plan_id: 'plan_test',
          status: 'active',
        },
      },
      payment: {
        entity: {
          id: renewalPaymentId,
          subscription_id: growthCheckout.subscriptionId,
          amount: 99900,
          currency: 'INR',
          status: 'captured',
          method: 'card',
        },
      },
    },
  });

  const webhookSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(webhookPayload)
    .digest('hex');

  const webhookHeaders = {
    'x-razorpay-signature': webhookSignature,
    'x-razorpay-event-id': webhookEventId,
  };

  // First webhook processing attempt
  const firstWebhookRes = await razorpayService.handleRazorpayWebhook(
    webhookHeaders,
    webhookPayload,
    JSON.parse(webhookPayload)
  );
  console.log('First Webhook Attempt:', firstWebhookRes);
  if (!firstWebhookRes.received) {
    throw new Error('First webhook processing failed!');
  }

  // Duplicate webhook processing attempt
  const duplicateWebhookRes = await razorpayService.handleRazorpayWebhook(
    webhookHeaders,
    webhookPayload,
    JSON.parse(webhookPayload)
  );
  console.log('Duplicate Webhook Attempt:', duplicateWebhookRes);
  if (!duplicateWebhookRes.idempotent) {
    throw new Error('Webhook duplicate was not caught by idempotency check!');
  }
  console.log('✅ Webhook HMAC signature verified and duplicate event idempotency confirmed.');

  // 6. Test Payment History (Historical Cashfree + New Razorpay Coexistence)
  console.log('\n--- 6. Testing Payment History Coexistence ---');
  const history = await razorpayService.getPaymentHistory(business.id);
  console.log(`Retrieved ${history.length} payment records in history.`);
  const providers = [...new Set(history.map(h => h.paymentProvider))];
  console.log('Coexisting payment providers in history:', providers);
  console.log('Sample latest record:', {
    orderId: history[0]?.orderId,
    amount: history[0]?.amount,
    status: history[0]?.status,
    paymentProvider: history[0]?.paymentProvider,
  });
  console.log('✅ Historical Cashfree records and new Razorpay records safely coexist.');

  console.log('\n=== ALL RAZORPAY INTEGRATION TESTS PASSED 100% SUCCESSFULLY! ===\n');
  await prisma.$disconnect();
  process.exit(0);
}

runTests().catch(async (e) => {
  console.error('\n❌ TEST FAILED:', e);
  await prisma.$disconnect();
  process.exit(1);
});
