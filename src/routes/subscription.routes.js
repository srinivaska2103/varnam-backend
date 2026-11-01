import { Router } from 'express';
import { subscriptionController } from '../controllers/subscription.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';

const router = Router();

// Public plan catalog endpoint
router.get('/plans', subscriptionController.getAvailablePlans);

// Protected endpoints for authenticated users
router.get('/me', authenticate, subscriptionController.getMySubscriptions);

// Razorpay Webhook endpoint (Public, unauthenticated, raw body verified)
router.post('/webhook/razorpay', subscriptionController.handleWebhook);
// Backwards compatibility alias if Cashfree webhook was configured
router.post('/webhook/cashfree', subscriptionController.handleWebhook);

// Business specific endpoints (require auth and membership)
router.get(
  '/:businessId/features',
  authenticate,
  requireBusinessMembership(),
  subscriptionController.getBusinessFeatures
);

router.post(
  '/:businessId/checkout',
  authenticate,
  requireBusinessMembership(['OWNER', 'MANAGER']),
  subscriptionController.createCheckoutSession
);

router.post(
  '/:businessId/verify-payment',
  authenticate,
  requireBusinessMembership(['OWNER', 'MANAGER']),
  subscriptionController.verifyPayment
);

router.get(
  '/:businessId/payment-history',
  authenticate,
  requireBusinessMembership(['OWNER', 'MANAGER']),
  subscriptionController.getPaymentHistory
);

router.post(
  '/:businessId/cancel',
  authenticate,
  requireBusinessMembership(['OWNER', 'MANAGER']),
  subscriptionController.cancelSubscription
);

router.post(
  '/:businessId/reactivate',
  authenticate,
  requireBusinessMembership(['OWNER', 'MANAGER']),
  subscriptionController.reactivateSubscription
);

router.patch(
  '/:businessId/auto-renewal',
  authenticate,
  requireBusinessMembership(['OWNER', 'MANAGER']),
  subscriptionController.updateAutoRenewal
);

router.post(
  '/:businessId/contact-sales',
  authenticate,
  requireBusinessMembership(),
  subscriptionController.submitContactSales
);

router.post(
  '/:businessId/schedule-change',
  authenticate,
  requireBusinessMembership(['OWNER', 'MANAGER']),
  subscriptionController.schedulePlanChange
);

router.post(
  '/:businessId/cancel-scheduled-change',
  authenticate,
  requireBusinessMembership(['OWNER', 'MANAGER']),
  subscriptionController.cancelScheduledPlanChange
);

export default router;

