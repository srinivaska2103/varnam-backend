import { whatsappBillingService } from '../services/whatsapp-billing.service.js';
import { ApiResponse, ApiError } from '../utils/apiResponse.js';

export const whatsappBillingController = {
  /**
   * GET /api/whatsapp-billing/config
   * Public/Studio/Admin read for platform WhatsApp billing mode
   */
  async getBillingConfig(req, res, next) {
    try {
      const config = await whatsappBillingService.getBillingConfig();
      return ApiResponse.success(res, { data: config });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/whatsapp-billing/config (Super Admin only)
   */
  async updateBillingConfig(req, res, next) {
    try {
      const adminUserId = req.user.id;
      const updated = await whatsappBillingService.updateBillingConfig(adminUserId, req.body);
      return ApiResponse.success(res, {
        message: 'WhatsApp billing mode updated successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/whatsapp-billing/pricing-rules
   */
  async getPricingRules(req, res, next) {
    try {
      const countryCode = req.query.country_code || 'IN';
      const rules = await whatsappBillingService.getPricingRules(countryCode);
      return ApiResponse.success(res, { data: rules });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/whatsapp-billing/pricing-rules (Super Admin only)
   */
  async upsertPricingRule(req, res, next) {
    try {
      const adminUserId = req.user.id;
      const rule = await whatsappBillingService.upsertPricingRule(adminUserId, req.body);
      return ApiResponse.success(res, {
        message: 'Pricing rule saved successfully',
        data: rule,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/whatsapp-billing/wallet
   * Studio gets its own messaging credit balance & ledger
   */
  async getStudioWallet(req, res, next) {
    try {
      const businessId = req.business?.id || req.headers['x-business-id'];
      if (!businessId) throw ApiError.badRequest('Business context required');
      const data = await whatsappBillingService.getStudioCreditAccount(businessId);
      return ApiResponse.success(res, { data });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/whatsapp-billing/topup-order
   * Studio initiates Razorpay topup for messaging credits
   */
  async createTopupOrder(req, res, next) {
    try {
      const businessId = req.business?.id || req.headers['x-business-id'];
      const userId = req.user.id;
      const { amount_rupees } = req.body;
      const order = await whatsappBillingService.createTopupOrder(businessId, userId, amount_rupees);
      return ApiResponse.success(res, { data: order });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/whatsapp-billing/verify-topup
   * Studio verifies Razorpay payment to credit messaging wallet
   */
  async verifyTopupPayment(req, res, next) {
    try {
      const businessId = req.business?.id || req.headers['x-business-id'];
      const userId = req.user.id;
      const result = await whatsappBillingService.verifyTopupPayment(businessId, userId, req.body);
      return ApiResponse.success(res, { data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/whatsapp-billing/estimate-campaign
   * Estimate cost for dispatching a template campaign
   */
  async estimateCampaignCost(req, res, next) {
    try {
      const businessId = req.business?.id || req.headers['x-business-id'];
      const { recipient_count, message_category = 'MARKETING', country_code = 'IN' } = req.body;
      const estimate = await whatsappBillingService.estimateCampaignCost(businessId, recipient_count, message_category, country_code);
      return ApiResponse.success(res, { data: estimate });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/whatsapp-billing/admin/overview (Super Admin only)
   */
  async getAdminOverview(req, res, next) {
    try {
      const overview = await whatsappBillingService.getAdminBillingOverview();
      return ApiResponse.success(res, { data: overview });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/whatsapp-billing/admin/studios (Super Admin only)
   */
  async getAdminStudioAccounts(req, res, next) {
    try {
      const accounts = await whatsappBillingService.getAdminStudioAccounts();
      return ApiResponse.success(res, { data: accounts });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/whatsapp-billing/admin/usages (Super Admin only)
   */
  async getAdminCampaignUsages(req, res, next) {
    try {
      const usages = await whatsappBillingService.getAdminCampaignUsages();
      return ApiResponse.success(res, { data: usages });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/whatsapp-billing/admin/meta-invoices (Super Admin only)
   */
  async recordMetaInvoice(req, res, next) {
    try {
      const adminUserId = req.user.id;
      const invoice = await whatsappBillingService.recordMetaInvoice(adminUserId, req.body);
      return ApiResponse.success(res, {
        message: 'Meta invoice recorded successfully',
        data: invoice,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/whatsapp-billing/admin/meta-settlements (Super Admin only)
   */
  async recordMetaSettlement(req, res, next) {
    try {
      const adminUserId = req.user.id;
      const settlement = await whatsappBillingService.recordMetaSettlement(adminUserId, req.body);
      return ApiResponse.success(res, {
        message: 'Meta settlement recorded successfully',
        data: settlement,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/whatsapp-billing/admin/meta-invoices (Super Admin only)
   */
  async getMetaInvoices(req, res, next) {
    try {
      const data = await whatsappBillingService.getMetaInvoicesAndSettlements();
      return ApiResponse.success(res, { data });
    } catch (err) {
      next(err);
    }
  },
};
