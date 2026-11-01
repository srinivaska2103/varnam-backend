import { Router } from 'express';
import { consultationController } from '../controllers/consultation.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  createConsultationSchema,
  updateConsultationSchema,
  updateConsultationStatusSchema,
  cancelConsultationSchema,
  listConsultationQuerySchema,
  consultationCalendarQuerySchema,
  upcomingConsultationQuerySchema,
  recordConsultationOutcomeSchema,
  listOutcomesQuerySchema,
} from '../validators/consultation.validator.js';

import { requireEntitlement } from '../middleware/entitlement.middleware.js';

const router = Router();

// All consultation management routes require authentication, business membership, and entitlement
router.use(authenticate);
router.use(requireBusinessMembership());
router.use(requireEntitlement('CONSULTATIONS'));

/**
 * Calendar and Upcoming endpoints (mounted before /:id to prevent route clash)
 */
router.get('/stats', consultationController.getConsultationStats);

/**
 * Outcomes endpoints (Mounted before /:id to avoid collision)
 */
router.get(
  '/outcomes',
  validateRequest(listOutcomesQuerySchema, 'query'),
  consultationController.listRecordedOutcomes
);

router.get(
  '/calendar',
  validateRequest(consultationCalendarQuerySchema, 'query'),
  consultationController.getConsultationsCalendar
);

router.get(
  '/upcoming',
  validateRequest(upcomingConsultationQuerySchema, 'query'),
  consultationController.getUpcomingConsultations
);

/**
 * Collection endpoints
 */
router.post(
  '/',
  validateRequest(createConsultationSchema),
  consultationController.createConsultation
);

router.get(
  '/',
  validateRequest(listConsultationQuerySchema, 'query'),
  consultationController.listConsultations
);

/**
 * Single consultation endpoints
 */
router.get('/:id', consultationController.getConsultationById);

router.patch(
  '/:id',
  requireBusinessMembership(['OWNER', 'MANAGER']),
  validateRequest(updateConsultationSchema),
  consultationController.updateConsultation
);

router.patch(
  '/:id/status',
  requireBusinessMembership(['OWNER', 'MANAGER']),
  validateRequest(updateConsultationStatusSchema),
  consultationController.updateConsultationStatus
);

router.patch(
  '/:id/cancel',
  requireBusinessMembership(['OWNER', 'MANAGER']),
  validateRequest(cancelConsultationSchema),
  consultationController.cancelConsultation
);

router.post(
  '/:id/outcome',
  validateRequest(recordConsultationOutcomeSchema),
  consultationController.recordConsultationOutcome
);

export default router;
