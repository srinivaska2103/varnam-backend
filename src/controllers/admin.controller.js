import { adminService } from '../services/admin.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const adminController = {
  /**
   * GET /api/admin/dashboard
   */
  async getDashboard(req, res, next) {
    try {
      const data = await adminService.getDashboardOverview();
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Admin dashboard overview retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/revenue
   */
  async getRevenue(req, res, next) {
    try {
      const { startDate, endDate, interval } = req.query;
      const data = await adminService.getRevenueAnalytics({ startDate, endDate, interval });
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Revenue analytics retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/accounts
   */
  async getAccounts(req, res, next) {
    try {
      const { page, limit, search, filter } = req.query;
      const data = await adminService.getAccounts({ page, limit, search, filter });
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Accounts retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/accounts/:id
   */
  async getAccountById(req, res, next) {
    try {
      const data = await adminService.getAccountById(req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Account details retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/admin/accounts/:id/status
   */
  async updateAccountStatus(req, res, next) {
    try {
      const { status, reason } = req.body;
      const data = await adminService.updateAccountStatus(req.params.id, { status, reason }, req.user.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: data.message,
        data: data.account,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/subscriptions
   */
  async getSubscriptions(req, res, next) {
    try {
      const { page, limit, planCode, status, search } = req.query;
      const data = await adminService.getSubscriptions({ page, limit, planCode, status, search });
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Subscriptions retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/payments
   */
  async getPayments(req, res, next) {
    try {
      const { page, limit, status, planCode, search, startDate, endDate } = req.query;
      const data = await adminService.getPayments({ page, limit, status, planCode, search, startDate, endDate });
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Payment orders retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/plans
   */
  async getPlans(req, res, next) {
    try {
      const data = await adminService.getPlans();
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Commercial plans retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/enquiries
   */
  async getPremiumEnquiries(req, res, next) {
    try {
      const { page, limit, status, search } = req.query;
      const data = await adminService.getPremiumEnquiries({ page, limit, status, search });
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Premium sales enquiries retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/admin/enquiries/:id
   */
  async updatePremiumEnquiry(req, res, next) {
    try {
      const { status, notes, followUpDate } = req.body;
      const data = await adminService.updatePremiumEnquiry(req.params.id, { status, notes, followUpDate }, req.user.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Enquiry updated successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/reports
   */
  async getReports(req, res, next) {
    try {
      const { type, startDate, endDate, format } = req.query;
      const rows = await adminService.getReportData({ type, startDate, endDate });

      if (format === 'csv') {
        if (!rows || rows.length === 0) {
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="${type}_report.csv"`);
          return res.status(200).send('No data available');
        }

        const headers = Object.keys(rows[0]);
        const csvRows = [
          headers.join(','),
          ...rows.map((row) =>
            headers
              .map((header) => {
                const val = row[header] !== undefined && row[header] !== null ? String(row[header]) : '';
                return `"${val.replace(/"/g, '""')}"`;
              })
              .join(',')
          ),
        ];

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${type}_report_${Date.now()}.csv"`);
        return res.status(200).send(csvRows.join('\n'));
      }

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Report data retrieved successfully',
        data: rows,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/activity
   */
  async getActivityLogs(req, res, next) {
    try {
      const { page, limit, entityType, action, search } = req.query;
      const data = await adminService.getActivityLogs({ page, limit, entityType, action, search });
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Activity audit logs retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/admin/auth/request-otp
   */
  async requestOtp(req, res, next) {
    try {
      const { email } = req.body;
      const data = await adminService.requestAdminOtp(email);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: data.message,
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/admin/auth/verify-otp
   */
  async verifyOtp(req, res, next) {
    try {
      const { email, otp } = req.body;
      const data = await adminService.verifyAdminOtp({ email, otp });
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Super Admin authentication successful',
        data,
      });
    } catch (error) {
      next(error);
    }
  },
};
