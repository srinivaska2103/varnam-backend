import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

/**
 * Business Membership Guard Middleware:
 * 1. Checks that the authenticated user (`req.user`) has an active membership in the business.
 * 2. Accepts business ID via route params `:businessId` or header `x-business-id`.
 * 3. Enforces optional role constraints (e.g. ['OWNER', 'MANAGER']).
 * 4. Attaches `req.business` and `req.membership` to the request object.
 */
export const requireBusinessMembership = (allowedRoles = []) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return next(ApiError.unauthorized('Authentication required'));
      }

      const businessId = req.params.businessId || req.headers['x-business-id'];
      if (!businessId || businessId === 'undefined' || businessId === 'null') {
        return next(ApiError.badRequest('Valid Business ID parameter (:businessId) or header (x-business-id) is required'));
      }

      // Check UUID format (8-4-4-4-12 hex characters)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(businessId)) {
        return next(ApiError.badRequest(`Invalid business ID format: '${businessId}'. Must be a valid UUID.`));
      }

      // Query membership from business_members
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

      if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
        return next(ApiError.forbidden(`Insufficient permissions: Requires ${allowedRoles.join(' or ')} role`));
      }

      req.membership = membership;
      req.business = membership.businesses;
      req.businessId = membership.business_id;

      next();
    } catch (error) {
      next(error);
    }
  };
};
