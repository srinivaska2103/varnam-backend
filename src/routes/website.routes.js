import { Router } from 'express';
import { websiteController } from '../controllers/website.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { requireEntitlement } from '../middleware/entitlement.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  upsertWebsiteSchema,
  updateBusinessHoursSchema,
  upsertStudioAboutSchema,
  upsertFooterSettingsSchema,
} from '../validators/website.validator.js';

const router = Router();

// Protected endpoints for Exclusive Plan: BRANDED_WEBSITE
// Studio Website editing is restricted strictly to OWNER / MANAGER
router.use(authenticate);
router.use(requireBusinessMembership(['OWNER', 'MANAGER']));

/**
 * Website Configuration Endpoints
 */
router.post(
  '/',
  requireBusinessMembership(),
  requireEntitlement('BRANDED_WEBSITE'),
  validateRequest(upsertWebsiteSchema),
  websiteController.upsertWebsite
);

router.get(
  '/:businessId/preview',
  requireBusinessMembership(),
  requireEntitlement('BRANDED_WEBSITE'),
  websiteController.getWebsitePreview
);

router.get(
  '/:businessId/hours',
  requireBusinessMembership(),
  requireEntitlement('BRANDED_WEBSITE'),
  websiteController.getBusinessHours
);

router.put(
  '/:businessId/hours',
  requireBusinessMembership(['OWNER', 'MANAGER']),
  requireEntitlement('BRANDED_WEBSITE'),
  validateRequest(updateBusinessHoursSchema),
  websiteController.updateBusinessHours
);

router.get(
  '/:businessId/about',
  requireBusinessMembership(),
  requireEntitlement('BRANDED_WEBSITE'),
  websiteController.getStudioAboutSection
);

router.post(
  '/:businessId/about',
  requireBusinessMembership(['OWNER', 'MANAGER']),
  requireEntitlement('BRANDED_WEBSITE'),
  validateRequest(upsertStudioAboutSchema),
  websiteController.upsertStudioAboutSection
);

router.get(
  '/:businessId/footer',
  requireBusinessMembership(),
  requireEntitlement('BRANDED_WEBSITE'),
  websiteController.getFooterSettings
);

router.put(
  '/:businessId/footer',
  requireBusinessMembership(['OWNER', 'MANAGER']),
  requireEntitlement('BRANDED_WEBSITE'),
  validateRequest(upsertFooterSettingsSchema),
  websiteController.upsertFooterSettings
);

router.get(
  '/:businessId',
  requireBusinessMembership(),
  requireEntitlement('BRANDED_WEBSITE'),
  websiteController.getWebsite
);

router.patch(
  '/:businessId',
  requireBusinessMembership(['OWNER', 'MANAGER']),
  requireEntitlement('BRANDED_WEBSITE'),
  validateRequest(upsertWebsiteSchema),
  websiteController.upsertWebsite
);

router.patch(
  '/:businessId/publish',
  requireBusinessMembership(['OWNER', 'MANAGER']),
  requireEntitlement('BRANDED_WEBSITE'),
  websiteController.publishWebsite
);

router.patch(
  '/:businessId/unpublish',
  requireBusinessMembership(['OWNER', 'MANAGER']),
  requireEntitlement('BRANDED_WEBSITE'),
  websiteController.unpublishWebsite
);

export default router;
