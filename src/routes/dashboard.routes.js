import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { requireEntitlement } from '../middleware/entitlement.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  dateRangeQuerySchema,
  activityQuerySchema,
} from '../validators/dashboard.validator.js';

const router = Router();

// All dashboard endpoints require authentication, business membership, and DASHBOARD_ANALYTICS entitlement
router.use(authenticate);
router.use(requireBusinessMembership());
router.use(requireEntitlement('DASHBOARD_ANALYTICS'));

/**
 * Analytics endpoints
 */
router.get(
  '/overview',
  validateRequest(dateRangeQuerySchema, 'query'),
  dashboardController.getOverview
);

router.get(
  '/revenue',
  validateRequest(dateRangeQuerySchema, 'query'),
  dashboardController.getRevenue
);

router.get(
  '/bookings',
  validateRequest(dateRangeQuerySchema, 'query'),
  dashboardController.getBookings
);

router.get(
  '/enquiries',
  validateRequest(dateRangeQuerySchema, 'query'),
  dashboardController.getEnquiries
);

router.get(
  '/payments',
  validateRequest(dateRangeQuerySchema, 'query'),
  dashboardController.getPayments
);

router.get(
  '/expenses',
  validateRequest(dateRangeQuerySchema, 'query'),
  dashboardController.getExpenses
);

router.get(
  '/inventory',
  dashboardController.getInventory
);

router.get(
  '/recent-activities',
  validateRequest(activityQuerySchema, 'query'),
  dashboardController.getRecentActivities
);

export default router;
