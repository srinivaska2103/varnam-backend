import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { requireEntitlement } from '../middleware/entitlement.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  recordPaymentSchema,
  recordCustomerRefundSchema,
  approveBookingRefundSchema,
  listPaymentsQuerySchema,
  refundPaymentSchema,
} from '../validators/payment.validator.js';

const router = Router();

// All payment routes require authentication, business membership, and core PAYMENT_TRACKING entitlement
// Critical actions (recording payments and processing refunds) are strictly admin-only
router.use(authenticate);
router.use(requireBusinessMembership(['OWNER', 'MANAGER']));
router.use(requireEntitlement('PAYMENT_TRACKING'));

/**
 * Payment collection endpoints
 */
router.post(
  '/',
  validateRequest(recordPaymentSchema),
  paymentController.recordPayment
);

/**
 * Customer Refund endpoints
 */
router.post(
  '/refund',
  validateRequest(recordCustomerRefundSchema),
  paymentController.recordCustomerRefund
);

router.get(
  '/refund-eligibility/:bookingId',
  paymentController.getBookingRefundEligibility
);

router.post(
  '/bookings/:bookingId/approve-refund',
  validateRequest(approveBookingRefundSchema),
  paymentController.approveBookingRefund
);

router.get(
  '/',
  validateRequest(listPaymentsQuerySchema, 'query'),
  paymentController.listPayments
);

/**
 * Summary metrics endpoint (Mounted before /:id to prevent route clash)
 */
router.get('/metrics', paymentController.getPaymentMetrics);

/**
 * Specific payment endpoints
 */
router.get('/:id', paymentController.getPaymentById);

router.get('/:id/receipt', paymentController.getPaymentReceipt);

router.post(
  '/:id/refund',
  validateRequest(refundPaymentSchema),
  paymentController.refundPayment
);

export default router;
