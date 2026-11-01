import { businessService } from '../services/business.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const businessController = {
  /**
   * POST /api/business
   * Create a new business and assign owner
   */
  async createBusiness(req, res, next) {
    try {
      const result = await businessService.createBusiness(req.user.id, req.body);
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Business created successfully and 14-day trial activated',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/business
   * List all businesses accessible to authenticated user
   */
  async getMyBusinesses(req, res, next) {
    try {
      const businesses = await businessService.getMyBusinesses(req.user.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Businesses retrieved successfully',
        data: businesses,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/business/:businessId
   * Retrieve single business details
   */
  async getBusinessById(req, res, next) {
    try {
      const business = await businessService.getBusinessById(req.params.businessId, req.user.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Business details retrieved successfully',
        data: business,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/business/:businessId
   * Update permitted business profile fields
   */
  async updateBusiness(req, res, next) {
    try {
      const updated = await businessService.updateBusiness(req.params.businessId, req.user.id, req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Business profile updated successfully',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/business/:businessId/summary
   * Dashboard summary with metrics and feature entitlements
   */
  async getBusinessSummary(req, res, next) {
    try {
      const summary = await businessService.getBusinessSummary(req.params.businessId, req.user.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Business dashboard summary retrieved successfully',
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/business/:businessId/members
   * List team members/staff for the business
   */
  async getBusinessMembers(req, res, next) {
    try {
      const members = await businessService.getBusinessMembers(req.params.businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Business members retrieved successfully',
        data: members,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/business/:businessId/users
   * Admin creates a USER account for this studio
   */
  async createStudioUser(req, res, next) {
    try {
      const result = await businessService.createStudioUser(
        req.params.businessId,
        req.user.id,
        req.body
      );
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'User account created successfully.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/business/:businessId/users/:userId/status
   * Admin toggles user activation status
   */
  async toggleStudioUserStatus(req, res, next) {
    try {
      const result = await businessService.toggleStudioUserStatus(
        req.params.businessId,
        req.user.id,
        req.params.userId,
        req.body.isActive
      );
      return ApiResponse.success(res, {
        statusCode: 200,
        message: `User account ${result.isActive ? 'activated' : 'deactivated'} successfully.`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/business/:businessId/users/:userId/reset-password
   * Admin resets user password
   */
  async resetStudioUserPassword(req, res, next) {
    try {
      const result = await businessService.resetStudioUserPassword(
        req.params.businessId,
        req.user.id,
        req.params.userId,
        req.body.newPassword
      );
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Password reset successfully.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/business/:businessId/users/:userId
   * Admin deletes a studio user
   */
  async deleteStudioUser(req, res, next) {
    try {
      const result = await businessService.deleteStudioUser(
        req.params.businessId,
        req.user.id,
        req.params.userId
      );
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'User account deleted successfully.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};
