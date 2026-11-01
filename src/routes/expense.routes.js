import { Router } from 'express';
import { expenseController } from '../controllers/expense.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { requireEntitlement } from '../middleware/entitlement.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  createExpenseSchema,
  updateExpenseSchema,
  listExpenseQuerySchema,
} from '../validators/expense.validator.js';

const router = Router();

// All expense routes require authentication, business membership, and core EXPENSES entitlement
// Financial operations are restricted strictly to OWNER / MANAGER
router.use(authenticate);
router.use(requireBusinessMembership(['OWNER', 'MANAGER']));
router.use(requireEntitlement('EXPENSES'));

/**
 * Aggregate routes (mounted before :id)
 */
router.get(
  '/summary',
  expenseController.getExpenseSummary
);

router.get(
  '/categories',
  expenseController.getExpenseCategories
);

/**
 * Expense endpoints
 */
router.post(
  '/',
  validateRequest(createExpenseSchema),
  expenseController.createExpense
);

router.get(
  '/',
  validateRequest(listExpenseQuerySchema, 'query'),
  expenseController.listExpenses
);

router.get('/:id', expenseController.getExpenseById);

router.patch(
  '/:id',
  validateRequest(updateExpenseSchema),
  expenseController.updateExpense
);

router.patch(
  '/:id/archive',
  expenseController.archiveExpense
);

router.delete(
  '/:id',
  expenseController.deleteExpense
);

export default router;
