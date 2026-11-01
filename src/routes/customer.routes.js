import { Router } from 'express';
import { customerController } from '../controllers/customer.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { requireEntitlement } from '../middleware/entitlement.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomerQuerySchema,
} from '../validators/customer.validator.js';

const router = Router();

// All customer routes require authentication, business membership, and core CRM entitlement
router.use(authenticate);
router.use(requireBusinessMembership());
router.use(requireEntitlement('CUSTOMER_MANAGEMENT'));

/**
 * Customer endpoints
 */
router.post(
  '/',
  validateRequest(createCustomerSchema),
  customerController.createCustomer
);

router.get(
  '/',
  validateRequest(listCustomerQuerySchema, 'query'),
  customerController.listCustomers
);

router.get('/:id', customerController.getCustomerById);

router.patch(
  '/:id',
  validateRequest(updateCustomerSchema),
  customerController.updateCustomer
);

router.patch('/:id/archive', customerController.archiveCustomer);

router.delete('/:id', customerController.deleteCustomer);

export default router;
