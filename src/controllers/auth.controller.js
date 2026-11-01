import { authService } from '../services/auth.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const authController = {
  /**
   * POST /api/auth/register
   */
  async register(req, res, next) {
    try {
      const result = await authService.register(req.body);
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'If the address can be registered, a verification email will be sent.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/verify-email
   */
  async verifyEmail(req, res, next) {
    try {
      const result = await authService.verifyEmail(req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Email verified successfully. You can now log in to your account.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/resend-otp
   */
  async resendOtp(req, res, next) {
    try {
      const result = await authService.resendOtp(req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'If an account exists with this email address, a new verification code has been sent.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/login
   */
  async login(req, res, next) {
    try {
      const result = await authService.login(req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Login successful',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/auth/me
   */
  async getMe(req, res, next) {
    try {
      const result = await authService.getMe(req.user.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Profile retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/logout
   */
  async logout(req, res, next) {
    try {
      // Stateless JWT tokens are cleared client-side by discarding the token from storage/cookie.
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Logged out successfully. Please remove your access token from client storage.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/forgot-password
   */
  async forgotPassword(req, res, next) {
    try {
      const result = await authService.forgotPassword(req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'If an account exists with this email address, a password reset code has been sent.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/reset-password
   */
  async resetPassword(req, res, next) {
    try {
      const result = await authService.resetPassword(req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Password has been reset successfully. You can now log in with your new password.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/studio-user/login
   */
  async studioUserLogin(req, res, next) {
    try {
      const result = await authService.studioUserLogin(req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Studio User sign in successful.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/auth/studio-info/:studioSlug
   */
  async getStudioPublicInfo(req, res, next) {
    try {
      const result = await authService.getStudioPublicInfo(req.params.studioSlug);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Studio information retrieved.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};

