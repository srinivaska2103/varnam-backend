import prisma from '../config/prisma.js';
import { verifyAccessToken } from '../utils/generate-token.js';
import { ApiError } from '../utils/apiResponse.js';

/**
 * Authentication Middleware:
 * - Requires Authorization: Bearer <token>
 * - Verifies token signature and expiry
 * - Verifies user exists, is active, and is email verified
 * - Attaches safe user object to req.user
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(ApiError.unauthorized('Authentication token is required'));
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return next(ApiError.unauthorized('Invalid authorization header format'));
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(ApiError.unauthorized('Token has expired. Please log in again.'));
      }
      return next(ApiError.unauthorized('Invalid authentication token'));
    }

    if (!decoded.userId) {
      return next(ApiError.unauthorized('Malformed authentication token'));
    }

    // Load active user state from database
    const user = await prisma.users.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        is_email_verified: true,
        is_active: true,
        is_super_admin: true,
      },
    });

    if (!user) {
      return next(ApiError.unauthorized('User associated with token no longer exists'));
    }

    if (!user.is_active) {
      return next(ApiError.forbidden('Your account is deactivated.'));
    }

    if (!user.is_email_verified) {
      return next(ApiError.forbidden('Please verify your email address before continuing.'));
    }

    // Attach validated user to request
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
