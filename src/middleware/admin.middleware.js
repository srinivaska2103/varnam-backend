import { ApiError } from '../utils/apiResponse.js';

/**
 * Super Admin Authorization Guard Middleware
 *
 * Requirements:
 * - Must be preceded by `authenticate` middleware (req.user exists)
 * - Verifies that req.user.is_super_admin === true
 * - Throws 403 Forbidden if user is not authorized as platform Super Admin
 */
export const requireSuperAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication token is required'));
    }

    if (!req.user.is_super_admin) {
      return next(
        ApiError.forbidden(
          'Access denied. This endpoint is exclusively for authorized VEXA TECH platform super administrators.'
        )
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};
