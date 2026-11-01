import { Router } from 'express';
import { websiteController } from '../controllers/website.controller.js';
import { enquiryController } from '../controllers/enquiry.controller.js';
import { campaignController } from '../controllers/campaign.controller.js';
import { validateRequest } from '../middleware/validate.js';
import {
  publicEnquirySchema,
  publicConsultationSchema,
} from '../validators/website.validator.js';
import { publicEnquirySubmissionSchema } from '../validators/enquiry.validator.js';
import { publicFormLimiter } from '../middleware/rateLimiter.js';
import { websiteService } from '../services/website.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

const router = Router();

/**
 * Public, read-only published website content
 */
router.get('/websites/:slug', websiteController.getPublicWebsite);

router.get('/websites/:slug/services', websiteController.getPublicServices);

router.get('/websites/:slug/packages', websiteController.getPublicPackages);

router.get('/websites/:slug/portfolio', websiteController.getPublicPortfolio);

router.get('/websites/:slug/footer', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const isPreview = req.query.preview === 'true';
    const website = await websiteService.resolvePublishedWebsite(slug, isPreview);
    const data = await websiteService.getFooterSettings(website.business_id);
    return ApiResponse.success(res, {
      statusCode: 200,
      message: 'Published footer settings retrieved successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Public enquiry submission with Spam Rate Limiting
 */
router.post(
  '/websites/:slug/enquiries',
  publicFormLimiter,
  validateRequest(publicEnquirySchema),
  websiteController.submitPublicEnquiry
);

/**
 * Public consultation requests with Spam Rate Limiting
 */
router.post(
  '/websites/:slug/consultation-requests',
  publicFormLimiter,
  validateRequest(publicConsultationSchema),
  websiteController.submitPublicConsultation
);

/**
 * Public Standalone Custom Enquiry Form (No login required)
 * GET  /api/public/forms/:slug - Fetch published enquiry form by studio slug
 * POST /api/public/forms/:slug/submit - Submit public enquiry with spam limiter
 */
router.get('/forms/:slug/availability', enquiryController.getPublicAvailability);
router.get('/forms/:slug/consultation-slots', enquiryController.getPublicConsultationSlots);
router.get('/websites/:slug/availability', enquiryController.getPublicAvailability);
router.get('/websites/:slug/consultation-slots', enquiryController.getPublicConsultationSlots);
router.get('/forms/:slug', enquiryController.getPublicForm);

router.post(
  '/forms/:slug/submit',
  publicFormLimiter,
  validateRequest(publicEnquirySubmissionSchema),
  enquiryController.submitPublicForm
);

/**
 * Public Campaign Unsubscribe
 * GET /api/public/campaigns/unsubscribe
 */
router.get('/campaigns/unsubscribe', campaignController.handlePublicUnsubscribe);

export default router;
