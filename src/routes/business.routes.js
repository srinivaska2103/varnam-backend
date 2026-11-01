import { Router } from 'express';
import { businessController } from '../controllers/business.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import { createBusinessSchema, updateBusinessSchema } from '../validators/business.validator.js';
import { createStudioUserSchema, resetStudioUserPasswordSchema } from '../validators/auth.validator.js';

const router = Router();

// All business routes require valid user authentication
router.use(authenticate);

/**
 * Business collection endpoints
 */
router.post('/', validateRequest(createBusinessSchema), businessController.createBusiness);
router.get('/', businessController.getMyBusinesses);

/**
 * Specific business endpoints (Guarded by business membership verification)
 */
router.get(
  '/:businessId',
  requireBusinessMembership(),
  businessController.getBusinessById
);

router.patch(
  '/:businessId',
  requireBusinessMembership(['OWNER', 'MANAGER']),
  validateRequest(updateBusinessSchema),
  businessController.updateBusiness
);

router.get(
  '/:businessId/summary',
  requireBusinessMembership(),
  businessController.getBusinessSummary
);

router.get(
  '/:businessId/members',
  requireBusinessMembership(['OWNER', 'MANAGER']),
  businessController.getBusinessMembers
);

/**
 * Studio User Management endpoints (Accessible strictly by ADMIN / OWNER / MANAGER)
 */
router.post(
  '/:businessId/users',
  requireBusinessMembership(['OWNER', 'MANAGER']),
  validateRequest(createStudioUserSchema),
  businessController.createStudioUser
);

router.patch(
  '/:businessId/users/:userId/status',
  requireBusinessMembership(['OWNER', 'MANAGER']),
  businessController.toggleStudioUserStatus
);

router.post(
  '/:businessId/users/:userId/reset-password',
  requireBusinessMembership(['OWNER', 'MANAGER']),
  validateRequest(resetStudioUserPasswordSchema),
  businessController.resetStudioUserPassword
);

router.delete(
  '/:businessId/users/:userId',
  requireBusinessMembership(['OWNER', 'MANAGER']),
  businessController.deleteStudioUser
);

export default router;
