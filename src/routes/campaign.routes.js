import { Router } from 'express';
import { campaignController } from '../controllers/campaign.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { requireEntitlement } from '../middleware/entitlement.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  createCampaignSchema,
  updateCampaignSchema,
  sendTestEmailSchema,
  sendWhatsAppCampaignSchema,
  previewWhatsAppCampaignSchema,
} from '../validators/campaign.validator.js';

const router = Router();

// Protect all campaign management routes with auth, tenant isolation, and NOTIFICATIONS entitlement
// Campaigns (outbound mass messaging) is strictly restricted to OWNER / MANAGER
router.use(authenticate);
router.use(requireBusinessMembership(['OWNER', 'MANAGER']));
router.use(requireEntitlement('NOTIFICATIONS'));

router.get('/', campaignController.listCampaigns);
router.get('/whatsapp-templates', campaignController.getWhatsAppTemplates);
router.get('/whatsapp-diagnostics', campaignController.getWhatsAppDiagnostics);
router.get('/audience-count', campaignController.getAudienceCount);
router.post('/whatsapp-preview', validateRequest(previewWhatsAppCampaignSchema), campaignController.previewWhatsAppCampaign);
router.post('/whatsapp-send', validateRequest(sendWhatsAppCampaignSchema), campaignController.sendWhatsAppCampaign);
router.post('/whatsapp-test-template', campaignController.sendTestWhatsAppTemplate);
router.get('/:id', campaignController.getCampaignById);
router.post('/', validateRequest(createCampaignSchema), campaignController.createCampaign);
router.put('/:id', validateRequest(updateCampaignSchema), campaignController.updateCampaign);
router.post('/:id/test', validateRequest(sendTestEmailSchema), campaignController.sendTestEmail);
router.post('/:id/launch', campaignController.launchCampaign);
router.post('/:id/cancel', campaignController.cancelCampaign);
router.delete('/:id', campaignController.deleteCampaign);

export default router;
