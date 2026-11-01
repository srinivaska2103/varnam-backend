import { Router } from 'express';
import { quotationController } from '../controllers/quotation.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { requireEntitlement } from '../middleware/entitlement.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  createQuotationSchema,
  updateQuotationSchema,
  updateQuotationStatusSchema,
  convertQuotationToBookingSchema,
  listQuotationQuerySchema,
} from '../validators/catalog.validator.js';

const router = Router();

// All quotation routes require authentication, business membership, and QUOTATIONS entitlement
router.use(authenticate);
router.use(requireBusinessMembership());
router.use(requireEntitlement('QUOTATIONS'));

/**
 * Quotation endpoints
 */
router.post(
  '/',
  validateRequest(createQuotationSchema),
  quotationController.createQuotation
);

router.get(
  '/',
  validateRequest(listQuotationQuerySchema, 'query'),
  quotationController.listQuotations
);

router.get('/:id', quotationController.getQuotationById);

router.patch(
  '/:id',
  validateRequest(updateQuotationSchema),
  quotationController.updateQuotation
);

router.patch(
  '/:id/status',
  validateRequest(updateQuotationStatusSchema),
  quotationController.updateQuotationStatus
);

router.post(
  '/:id/convert-to-booking',
  validateRequest(convertQuotationToBookingSchema),
  quotationController.convertQuotationToBooking
);

router.delete('/:id', quotationController.deleteQuotation);

export default router;
