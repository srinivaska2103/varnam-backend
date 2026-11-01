import { notificationService } from '../services/notification.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const notificationController = {
  /**
   * GET /api/notifications/preferences
   */
  async getPreferences(req, res, next) {
    try {
      const businessId = req.businessId;
      const data = await notificationService.getPreferences(businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Notification preferences retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/notifications/preferences
   */
  async updatePreferences(req, res, next) {
    try {
      const businessId = req.businessId;
      const data = await notificationService.updatePreferences(businessId, req.body.preferences);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Notification preferences updated successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/notifications/summary
   */
  async getSummary(req, res, next) {
    try {
      const businessId = req.businessId;
      const data = await notificationService.getNotificationSummary(businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Notification summary retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/notifications
   */
  async listNotifications(req, res, next) {
    try {
      const businessId = req.businessId;
      const result = await notificationService.listNotifications(businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Notifications retrieved successfully',
        data: result.notifications,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/notifications/:id/read
   */
  async markAsRead(req, res, next) {
    try {
      const businessId = req.businessId;
      const data = await notificationService.markAsRead(businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Notification marked as read',
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/notifications/read-all
   */
  async markAllAsRead(req, res, next) {
    try {
      const businessId = req.businessId;
      const data = await notificationService.markAllAsRead(businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'All notifications marked as read',
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/notifications/:id/retry
   */
  async retryJob(req, res, next) {
    try {
      const businessId = req.businessId;
      const data = await notificationService.retryFailedJob(businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Notification job retried',
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/notifications/process-queue (Trigger manual or cron queue processing)
   */
  async processQueue(req, res, next) {
    try {
      const processed = await notificationService.processDueJobs(20);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: `Processed ${processed.length} due notification jobs`,
        data: { processed_count: processed.length },
      });
    } catch (err) {
      next(err);
    }
  },
};
