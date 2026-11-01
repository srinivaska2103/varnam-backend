import { Router } from 'express';
import { reportController } from '../controllers/report.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { requireEntitlement } from '../middleware/entitlement.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import { financialReportQuerySchema } from '../validators/expense.validator.js';

const router = Router();

// Financial reports require authentication, business membership, and core DASHBOARD_ANALYTICS entitlement
router.use(authenticate);
router.use(requireBusinessMembership(['OWNER', 'MANAGER']));
router.use(requireEntitlement('DASHBOARD_ANALYTICS'));

/**
 * GET /api/reports/financial
 */
router.get(
  '/financial',
  validateRequest(financialReportQuerySchema, 'query'),
  reportController.getFinancialReport
);

export default router;
