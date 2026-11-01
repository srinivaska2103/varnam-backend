import { Router } from 'express';
import { serviceController } from '../controllers/service.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { requireEntitlement } from '../middleware/entitlement.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  createServiceSchema,
  updateServiceSchema,
  listServiceQuerySchema,
} from '../validators/catalog.validator.js';

const router = Router();

// All service routes require authentication, business membership, and SERVICES_AND_PACKAGES entitlement
router.use(authenticate);
router.use(requireBusinessMembership());
router.use(requireEntitlement('SERVICES_AND_PACKAGES'));

/**
 * Service routes
 */
router.post(
  '/',
  validateRequest(createServiceSchema),
  serviceController.createService
);

router.get(
  '/',
  validateRequest(listServiceQuerySchema, 'query'),
  serviceController.listServices
);

router.get('/:id', serviceController.getServiceById);

router.patch(
  '/:id',
  validateRequest(updateServiceSchema),
  serviceController.updateService
);

router.patch('/:id/archive', serviceController.archiveService);

router.delete('/:id', serviceController.deleteService);

export default router;
