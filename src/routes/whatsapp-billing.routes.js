import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { requireSuperAdmin } from '../middleware/admin.middleware.js';
import { whatsappBillingController } from '../controllers/whatsapp-billing.controller.js';

const router = Router();

// 1. Platform configuration and public pricing
router.get('/config', whatsappBillingController.getBillingConfig);
router.get('/pricing-rules', whatsappBillingController.getPricingRules);

// 2. Studio Tenant Endpoints (Requires auth + business membership)
router.get('/wallet', authenticate, requireBusinessMembership(), whatsappBillingController.getStudioWallet);
router.post('/topup-order', authenticate, requireBusinessMembership(['OWNER', 'MANAGER']), whatsappBillingController.createTopupOrder);
router.post('/verify-topup', authenticate, requireBusinessMembership(['OWNER', 'MANAGER']), whatsappBillingController.verifyTopupPayment);
router.post('/estimate-campaign', authenticate, requireBusinessMembership(), whatsappBillingController.estimateCampaignCost);

// 3. Super Admin Management Endpoints (Requires auth + requireSuperAdmin)
router.put('/config', authenticate, requireSuperAdmin, whatsappBillingController.updateBillingConfig);
router.post('/pricing-rules', authenticate, requireSuperAdmin, whatsappBillingController.upsertPricingRule);
router.get('/admin/overview', authenticate, requireSuperAdmin, whatsappBillingController.getAdminOverview);
router.get('/admin/studios', authenticate, requireSuperAdmin, whatsappBillingController.getAdminStudioAccounts);
router.get('/admin/usages', authenticate, requireSuperAdmin, whatsappBillingController.getAdminCampaignUsages);
router.post('/admin/meta-invoices', authenticate, requireSuperAdmin, whatsappBillingController.recordMetaInvoice);
router.get('/admin/meta-invoices', authenticate, requireSuperAdmin, whatsappBillingController.getMetaInvoices);
router.post('/admin/meta-settlements', authenticate, requireSuperAdmin, whatsappBillingController.recordMetaSettlement);

export default router;
