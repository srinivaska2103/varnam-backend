import { Router } from 'express';
import { websiteController } from '../controllers/website.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { requireEntitlement } from '../middleware/entitlement.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  createPortfolioSchema,
  updatePortfolioSchema,
} from '../validators/website.validator.js';

const router = Router();

// Protected endpoints for Exclusive Plan: PORTFOLIO_SHOWCASE
router.use(authenticate);
router.use(requireBusinessMembership());
router.use(requireEntitlement('PORTFOLIO_SHOWCASE'));

/**
 * Portfolio Items Collection Endpoints
 */
router.post(
  '/',
  validateRequest(createPortfolioSchema),
  websiteController.createPortfolioItem
);

router.get(
  '/',
  websiteController.listPortfolio
);

/**
 * Single Portfolio Item Endpoints
 */
router.get(
  '/:id',
  websiteController.getPortfolioItemById
);

router.patch(
  '/:id',
  validateRequest(updatePortfolioSchema),
  websiteController.updatePortfolioItem
);

router.patch(
  '/:id/publish',
  websiteController.publishPortfolioItem
);

router.patch(
  '/:id/archive',
  websiteController.archivePortfolioItem
);

router.delete(
  '/:id',
  websiteController.deletePortfolioItem
);

export default router;
