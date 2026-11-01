import { dashboardService } from '../services/dashboard.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const dashboardController = {
  /**
   * GET /api/dashboard/overview
   */
  async getOverview(req, res, next) {
    try {
      const data = await dashboardService.getOverview(req.businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Dashboard overview statistics retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/dashboard/revenue
   */
  async getRevenue(req, res, next) {
    try {
      const data = await dashboardService.getRevenueAnalytics(req.businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Revenue analytics retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/dashboard/bookings
   */
  async getBookings(req, res, next) {
    try {
      const data = await dashboardService.getBookingAnalytics(req.businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Booking analytics retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/dashboard/enquiries
   */
  async getEnquiries(req, res, next) {
    try {
      const data = await dashboardService.getEnquiryAnalytics(req.businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Enquiry analytics retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/dashboard/payments
   */
  async getPayments(req, res, next) {
    try {
      const data = await dashboardService.getPaymentAnalytics(req.businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Payment collection analytics retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/dashboard/expenses
   */
  async getExpenses(req, res, next) {
    try {
      const data = await dashboardService.getExpenseAnalytics(req.businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Expense analytics retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/dashboard/inventory
   */
  async getInventory(req, res, next) {
    try {
      const data = await dashboardService.getInventoryAnalytics(req.businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Inventory analytics retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/dashboard/recent-activities
   */
  async getRecentActivities(req, res, next) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
      const data = await dashboardService.getRecentActivities(req.businessId, limit);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Recent activities retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  },
};
