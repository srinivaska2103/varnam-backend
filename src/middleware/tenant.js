import { ApiError } from '../utils/apiResponse.js';
import prisma from '../config/prisma.js';

/**
 * Tenant Isolation & Context Middleware
 * Enforces server-side tenant isolation:
 * 1. Checks that the active business ID exists and belongs to the authenticated user's memberships.
 * 2. Attaches the validated business to `req.tenant`.
 * 3. Prevents cross-tenant access and client-side tenant spoofing.
 */
export const requireTenant = (options = { allowedRoles: [] }) => {
  return async (req, res, next) => {
    try {
      // In Phase 2 auth, req.user will be populated by authenticateUser middleware
      const user = req.user;
      if (!user) {
        return next(ApiError.unauthorized('Authentication required'));
      }

      // Tenant can be specified via header `x-business-id` or route params
      const businessId = req.headers['x-business-id'] || req.params.businessId;

      if (!businessId) {
        return next(ApiError.badRequest('Business tenant context (x-business-id) is required'));
      }

      // Validate membership in database directly to ensure tenant isolation
      const membership = await prisma.business_members.findFirst({
        where: {
          business_id: businessId,
          user_id: user.id,
          is_active: true,
        },
        include: {
          businesses: true,
        },
      });

      if (!membership || !membership.businesses || membership.businesses.status !== 'ACTIVE') {
        return next(ApiError.forbidden('You do not have access to this business tenant'));
      }

      if (options.allowedRoles && options.allowedRoles.length > 0) {
        if (!options.allowedRoles.includes(membership.role)) {
          return next(ApiError.forbidden('Insufficient permissions for this action'));
        }
      }

      // Attach validated tenant context
      req.tenant = {
        businessId: membership.business_id,
        business: membership.businesses,
        role: membership.role,
        memberId: membership.id,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
};
