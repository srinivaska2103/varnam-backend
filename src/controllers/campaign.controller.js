import { campaignService } from '../services/campaign.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const campaignController = {
  /**
   * List campaigns
   * GET /api/campaigns
   */
  async listCampaigns(req, res, next) {
    try {
      const data = await campaignService.listCampaigns(req.businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Campaigns retrieved successfully',
        data: data.campaigns,
        pagination: data.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get single campaign by ID
   * GET /api/campaigns/:id
   */
  async getCampaignById(req, res, next) {
    try {
      const campaign = await campaignService.getCampaignById(req.businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Campaign details retrieved successfully',
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List all 9 WhatsApp templates with status, preview, and read-only flags
   * GET /api/campaigns/whatsapp-templates
   */
  async getWhatsAppTemplates(req, res, next) {
    try {
      const data = await campaignService.getWhatsAppTemplates(req.businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'WhatsApp templates retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Preview audience count
   * GET /api/campaigns/audience-count
   */
  async getAudienceCount(req, res, next) {
    try {
      const { segment = 'ALL_CONTACTS', packageId, customerIds } = req.query;
      let parsedCustomerIds = null;
      if (customerIds) {
        parsedCustomerIds = Array.isArray(customerIds)
          ? customerIds
          : typeof customerIds === 'string'
          ? customerIds.split(',').filter(Boolean)
          : null;
      }
      const result = await campaignService.getAudienceCount(req.businessId, segment, packageId, parsedCustomerIds);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Audience calculated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Create draft campaign
   * POST /api/campaigns
   */
  async createCampaign(req, res, next) {
    try {
      const campaign = await campaignService.createCampaign(req.businessId, req.userId, req.body);
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Marketing campaign created successfully',
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update draft campaign
   * PUT /api/campaigns/:id
   */
  async updateCampaign(req, res, next) {
    try {
      const campaign = await campaignService.updateCampaign(req.businessId, req.params.id, req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Campaign updated successfully',
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Send test email
   * POST /api/campaigns/:id/test
   */
  async sendTestEmail(req, res, next) {
    try {
      const result = await campaignService.sendTestEmail(req.businessId, req.params.id, req.body.test_email);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Launch campaign now
   * POST /api/campaigns/:id/launch
   */
  async launchCampaign(req, res, next) {
    try {
      const result = await campaignService.launchCampaign(req.businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Campaign launched successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Cancel campaign
   * POST /api/campaigns/:id/cancel
   */
  async cancelCampaign(req, res, next) {
    try {
      const result = await campaignService.cancelCampaign(req.businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Campaign cancelled successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete campaign
   * DELETE /api/campaigns/:id
   */
  async deleteCampaign(req, res, next) {
    try {
      const result = await campaignService.deleteCampaign(req.businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Campaign deleted successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Public Unsubscribe Handler
   * GET /api/public/campaigns/unsubscribe
   */
  async handlePublicUnsubscribe(req, res, next) {
    try {
      const { biz, email, reason } = req.query;
      if (!biz || !email) {
        return res.status(400).send(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h2>Invalid Unsubscribe Link</h2>
              <p>Missing required parameters.</p>
            </body>
          </html>
        `);
      }

      await campaignService.unsubscribe(biz, email, reason || 'Unsubscribed via email link');

      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Unsubscribed Successfully</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fffaf5; color: #1e293b; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }

            .icon { font-size: 48px; margin-bottom: 16px; }
            h2 { color: #ea580c; margin-top: 0; }
            p { font-size: 14px; line-height: 1.6; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✅</div>
            <h2>Unsubscribed Successfully</h2>
            <p><strong>${email}</strong> has been removed from marketing and promotional lists for this studio.</p>
            <p>You will still receive critical transactional notifications regarding any confirmed wedding bookings.</p>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Preview WhatsApp Campaign Template 9
   * POST /api/campaigns/whatsapp-preview
   */
  async previewWhatsAppCampaign(req, res, next) {
    try {
      const data = await campaignService.previewWhatsAppCampaign(req.businessId, req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'WhatsApp template preview generated',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Send WhatsApp Campaign Template 9 (User-Triggered)
   * POST /api/campaigns/whatsapp-send
   */
  async sendWhatsAppCampaign(req, res, next) {
    try {
      const data = await campaignService.sendWhatsAppCampaign(req.businessId, req.user.id, req.body);
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'WhatsApp campaign initiated and dispatched',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Preview WhatsApp Campaign Template 9
   * POST /api/campaigns/whatsapp-preview
   */
  async previewWhatsAppCampaign(req, res, next) {
    try {
      const data = await campaignService.previewWhatsAppCampaign(req.businessId, req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'WhatsApp template preview generated',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Send WhatsApp Campaign Template 9 (User-Triggered)
   * POST /api/campaigns/whatsapp-send
   */
  async sendWhatsAppCampaign(req, res, next) {
    try {
      const data = await campaignService.sendWhatsAppCampaign(req.businessId, req.user.id, req.body);
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'WhatsApp campaign initiated and dispatched',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Send Test WhatsApp Template (Templates 1 to 9)
   * POST /api/campaigns/whatsapp-test-template
   */
  async sendTestWhatsAppTemplate(req, res, next) {
    try {
      const data = await campaignService.sendTestWhatsAppTemplate(req.businessId, req.user.id, req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: `Test WhatsApp message (${data.template_name}) dispatched successfully`,
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Diagnostic inspection for Meta WhatsApp configuration and registered templates
   * GET /api/campaigns/whatsapp-diagnostics
   */
  async getWhatsAppDiagnostics(req, res, next) {
    try {
      const data = await campaignService.getWhatsAppDiagnostics(req.businessId, req.user);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'WhatsApp diagnostics retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },
};
