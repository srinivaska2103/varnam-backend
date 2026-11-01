import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

/**
 * Entitlement Check Middleware:
 * Validates that the business being accessed possesses an active subscription entitlement
 * with the required feature key enabled.
 * 
 * @param {string} requiredFeature - Feature key, e.g. 'BRANDED_WEBSITE', 'PORTFOLIO_SHOWCASE'
 * @example router.post('/website/publish', requireEntitlement('BRANDED_WEBSITE'), handler);
 */
export const requireEntitlement = (requiredFeature) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return next(ApiError.unauthorized('Authentication required'));
      }

      // Check if business context is already resolved by requireBusinessMembership
      let business = req.business;
      const businessId = req.businessId || req.params.businessId || req.headers['x-business-id'];
      if (!businessId || businessId === 'undefined' || businessId === 'null') {
        return next(ApiError.badRequest('Valid Business ID parameter (:businessId) or header (x-business-id) is required'));
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(businessId)) {
        return next(ApiError.badRequest(`Invalid business ID format: '${businessId}'. Must be a valid UUID.`));
      }

      if (!business) {
        // Verify user is authorized member of this business
        const membership = await prisma.business_members.findFirst({
          where: {
            business_id: businessId,
            user_id: user.id,
            is_active: true,
          },
          include: {
            businesses: {
              include: {
                business_entitlements: {
                  include: {
                    plans: {
                      include: {
                        plan_features: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (!membership || !membership.businesses || membership.businesses.status !== 'ACTIVE') {
          return next(ApiError.forbidden('You do not have access to this business'));
        }

        req.membership = membership;
        req.business = membership.businesses;
        req.businessId = membership.business_id;
        business = membership.businesses;
      }

      // Retrieve entitlement
      const entitlement = business.business_entitlements;
      const now = new Date();
      const isWithinBillingPeriod = Boolean(entitlement?.ends_at && new Date(entitlement.ends_at) > now);
      const isGracePeriodCancelled = entitlement?.status === 'CANCELLED' && isWithinBillingPeriod;
      const isEligibleStatus = ['ACTIVE', 'TRIAL'].includes(entitlement?.status) || isGracePeriodCancelled;

      if (!entitlement || !isEligibleStatus) {
        return next(
          ApiError.forbidden('Active subscription required to access this feature. Please subscribe or contact support.')
        );
      }

      // Check if entitlement period has expired
      if (entitlement.ends_at && now > new Date(entitlement.ends_at)) {
        return next(
          ApiError.forbidden('Your subscription plan has expired. Please renew to continue accessing this feature.')
        );
      }

      const plan = entitlement.plans;
      if (!plan || !plan.is_active) {
        return next(ApiError.forbidden('Invalid or inactive subscription plan'));
      }

      // Check feature key in plan_features
      const feature = plan.plan_features?.find((f) => f.feature_key === requiredFeature);

      if (!feature || !feature.enabled) {
        return next(
          ApiError.forbidden(
            `Feature '${requiredFeature}' is not included in your ${plan.name} plan. Upgrade your plan to access this feature.`
          )
        );
      }

      // Attach active entitlement and feature context to request
      req.entitlement = entitlement;
      req.plan = plan;

      next();
    } catch (error) {
      next(error);
    }
  };
};
