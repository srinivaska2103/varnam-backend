import { Router } from 'express';
import { packageController } from '../controllers/package.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { requireEntitlement } from '../middleware/entitlement.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  createPackageSchema,
  updatePackageSchema,
  addPackageServiceSchema,
  listPackageQuerySchema,
} from '../validators/catalog.validator.js';

const router = Router();

// All package routes require authentication, business membership, and SERVICES_AND_PACKAGES entitlement
router.use(authenticate);
router.use(requireBusinessMembership());
router.use(requireEntitlement('SERVICES_AND_PACKAGES'));

/**
 * Package endpoints
 */
router.post(
  '/',
  validateRequest(createPackageSchema),
  packageController.createPackage
);

router.get(
  '/',
  validateRequest(listPackageQuerySchema, 'query'),
  packageController.listPackages
);

router.get('/:id', packageController.getPackageById);

router.patch(
  '/:id',
  validateRequest(updatePackageSchema),
  packageController.updatePackage
);

router.patch('/:id/archive', packageController.archivePackage);
router.delete('/:id', packageController.deletePackage);

router.post(
  '/:id/services',
  validateRequest(addPackageServiceSchema),
  packageController.addServiceToPackage
);

router.delete('/:id/services/:serviceId', packageController.removeServiceFromPackage);

export default router;
