import { Router } from 'express';
import { enquiryController } from '../controllers/enquiry.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { requireEntitlement } from '../middleware/entitlement.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  createEnquirySchema,
  updateEnquirySchema,
  listEnquiryQuerySchema,
  createActivitySchema,
  followUpQuerySchema,
  convertEnquirySchema,
  enquiryFormConfigSchema,
} from '../validators/enquiry.validator.js';

const router = Router();

// All enquiry routes require authentication, business membership, and core CRM entitlement
router.use(authenticate);
router.use(requireBusinessMembership());
router.use(requireEntitlement('ENQUIRY_MANAGEMENT'));

/**
 * Enquiry Form Configuration endpoints (Form Builder)
 * Mounted before /:id to prevent route clash
 */
router.get('/form-config', enquiryController.getFormConfig);
router.put('/form-config', validateRequest(enquiryFormConfigSchema), enquiryController.updateFormConfig);
router.patch('/form-config/status', enquiryController.setFormStatus);

/**
 * Follow-ups endpoint (MUST be mounted before /:id to prevent route clash)
 */
router.get(
  '/follow-ups',
  validateRequest(followUpQuerySchema, 'query'),
  enquiryController.getFollowUps
);

router.post(
  '/:id/complete-follow-up',
  enquiryController.completeFollowUp
);

/**
 * Enquiry collection endpoints
 */
router.post(
  '/',
  validateRequest(createEnquirySchema),
  enquiryController.createEnquiry
);

router.get(
  '/',
  validateRequest(listEnquiryQuerySchema, 'query'),
  enquiryController.listEnquiries
);

/**
 * Specific enquiry endpoints
 */
router.get('/:id', enquiryController.getEnquiryById);

router.patch(
  '/:id',
  validateRequest(updateEnquirySchema),
  enquiryController.updateEnquiry
);

/**
 * Enquiry interactions & activities
 */
router.post(
  '/:id/activities',
  validateRequest(createActivitySchema),
  enquiryController.recordActivity
);

/**
 * Convert enquiry into confirmed booking
 */
router.post(
  '/:id/convert',
  validateRequest(convertEnquirySchema),
  enquiryController.convertEnquiryToBooking
);

export default router;
