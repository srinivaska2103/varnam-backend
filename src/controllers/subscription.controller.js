import { subscriptionService } from '../services/subscription.service.js';
import { razorpayService } from '../services/razorpay.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const subscriptionController = {
  /**
   * GET /api/subscriptions/plans
   * List all available subscription plans & feature entitlements
   */
  async getAvailablePlans(req, res, next) {
    try {
      const plans = await subscriptionService.getAvailablePlans();
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Available subscription plans retrieved successfully',
        data: plans,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/subscriptions/me
   * Retrieve active business subscriptions for the authenticated user
   */
  async getMySubscriptions(req, res, next) {
    try {
      const subscriptions = await subscriptionService.getMySubscriptions(req.user.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Subscriptions retrieved successfully',
        data: subscriptions,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/subscriptions/:businessId/features
   * Retrieve authorized feature entitlements for a specific business
   */
  async getBusinessFeatures(req, res, next) {
    try {
      const features = await subscriptionService.getBusinessFeatures(req.params.businessId, req.user.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Business feature entitlements retrieved successfully',
        data: features,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/subscriptions/:businessId/checkout
   * Initiate Razorpay PG Checkout or Recurring Subscription
   */
  async createCheckoutSession(req, res, next) {
    try {
      const { planCode, returnUrl } = req.body;
      const businessId = req.businessId || req.params.businessId;

      if (planCode === 'EXCLUSIVE_LIFETIME') {
        return ApiResponse.error(res, {
          statusCode: 400,
          message: 'The Premium package (₹29,999) is available exclusively via Contact Sales. No online checkout is available.',
        });
      }

      let result;
      if (planCode === 'BASIC_MONTHLY' || planCode === 'GROWTH_MONTHLY') {
        result = await razorpayService.initiateRecurringSubscription(businessId, req.user.id, planCode, returnUrl);
      } else {
        return ApiResponse.error(res, {
          statusCode: 400,
          message: 'Invalid plan selected for checkout',
        });
      }

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Checkout session created successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/subscriptions/:businessId/verify-payment
   * Verify Razorpay Payment status and fulfill entitlements
   */
  async verifyPayment(req, res, next) {
    try {
      const businessId = req.businessId || req.params.businessId;
      const result = await razorpayService.verifyPayment(businessId, req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: result.isPaid ? 'Payment verified and subscription activated' : 'Payment verification completed',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/subscriptions/:businessId/payment-history
   * Retrieve business payment & billing orders history
   */
  async getPaymentHistory(req, res, next) {
    try {
      const businessId = req.businessId || req.params.businessId;
      const history = await razorpayService.getPaymentHistory(businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Payment history retrieved successfully',
        data: history,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/subscriptions/webhook/razorpay (and /webhook/cashfree for compatibility)
   * Process Razorpay Gateway and Subscription webhooks
   */
  async handleWebhook(req, res, next) {
    try {
      const result = await razorpayService.handleRazorpayWebhook(
        req.headers,
        req.rawBody || JSON.stringify(req.body),
        req.body
      );
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Webhook processed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/subscriptions/:businessId/cancel
   * Cancel subscription for business
   */
  async cancelSubscription(req, res, next) {
    try {
      const businessId = req.businessId || req.params.businessId;
      const { reason } = req.body || {};
      const result = await razorpayService.cancelSubscription(businessId, req.user.id, reason);
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
   * POST /api/subscriptions/:businessId/reactivate
   * Reactivate cancelled subscription
   */
  async reactivateSubscription(req, res, next) {
    try {
      const businessId = req.businessId || req.params.businessId;
      const result = await subscriptionService.reactivateSubscription(businessId, req.user.id);
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
   * PATCH /api/subscriptions/:businessId/auto-renewal
   * Update auto-renewal preference
   */
  async updateAutoRenewal(req, res, next) {
    try {
      const businessId = req.businessId || req.params.businessId;
      const { autoRenew } = req.body;
      const result = await subscriptionService.updateAutoRenewal(businessId, req.user.id, autoRenew);
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
   * POST /api/subscriptions/:businessId/contact-sales
   * Submit enquiry for Premium plan
   */
  async submitContactSales(req, res, next) {
    try {
      const businessId = req.businessId || req.params.businessId;
      const result = await subscriptionService.submitContactSalesEnquiry(businessId, req.user.id, req.body);
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
   * POST /api/subscriptions/:businessId/schedule-change
   * Schedule a plan change for the end of current billing cycle
   */
  async schedulePlanChange(req, res, next) {
    try {
      const businessId = req.businessId || req.params.businessId;
      const { targetPlanCode } = req.body;
      const result = await subscriptionService.schedulePlanChange(businessId, req.user.id, targetPlanCode);
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
   * POST /api/subscriptions/:businessId/cancel-scheduled-change
   * Cancel a previously scheduled plan change
   */
  async cancelScheduledPlanChange(req, res, next) {
    try {
      const businessId = req.businessId || req.params.businessId;
      const result = await subscriptionService.cancelScheduledPlanChange(businessId, req.user.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};




