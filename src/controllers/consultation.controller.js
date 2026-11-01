import { consultationService } from '../services/consultation.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const consultationController = {
  /**
   * POST /api/consultations - Schedule a consultation
   */
  async createConsultation(req, res, next) {
    try {
      const consultation = await consultationService.createConsultation(
        req.businessId,
        req.user.id,
        req.body
      );
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Consultation scheduled successfully',
        data: consultation,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/consultations - List consultations with pagination & filters
   */
  async listConsultations(req, res, next) {
    try {
      const result = await consultationService.listConsultations(req.businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Consultations retrieved successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/consultations/calendar - Calendar view
   */
  async getConsultationsCalendar(req, res, next) {
    try {
      const result = await consultationService.getConsultationsCalendar(req.businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Consultation calendar retrieved successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/consultations/upcoming - Upcoming consultations
   */
  async getUpcomingConsultations(req, res, next) {
    try {
      const result = await consultationService.getUpcomingConsultations(req.businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Upcoming consultations retrieved successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/consultations/stats - Summary statistics
   */
  async getConsultationStats(req, res, next) {
    try {
      const stats = await consultationService.getConsultationStats(req.businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Consultation statistics retrieved successfully',
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/consultations/:id - Get consultation details
   */
  async getConsultationById(req, res, next) {
    try {
      const consultation = await consultationService.getConsultationById(
        req.businessId,
        req.params.id
      );
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Consultation details retrieved successfully',
        data: consultation,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/consultations/:id - Update consultation details
   */
  async updateConsultation(req, res, next) {
    try {
      const consultation = await consultationService.updateConsultation(
        req.businessId,
        req.params.id,
        req.body
      );
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Consultation updated successfully',
        data: consultation,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/consultations/:id/status - Update consultation status
   */
  async updateConsultationStatus(req, res, next) {
    try {
      const consultation = await consultationService.updateConsultationStatus(
        req.businessId,
        req.user.id,
        req.params.id,
        req.body
      );
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Consultation status updated successfully',
        data: consultation,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/consultations/:id/cancel - Cancel consultation
   */
  async cancelConsultation(req, res, next) {
    try {
      const consultation = await consultationService.cancelConsultation(
        req.businessId,
        req.params.id,
        req.body?.cancellation_reason
      );
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Consultation cancelled successfully',
        data: consultation,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/consultations/:id/outcome - Record outcome & sync follow-up
   */
  async recordConsultationOutcome(req, res, next) {
    try {
      const result = await consultationService.recordConsultationOutcome(
        req.businessId,
        req.user.id,
        req.params.id,
        req.body
      );
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Consultation outcome recorded successfully and follow-up synced',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/consultations/outcomes - List recorded outcome history with counts & filters
   */
  async listRecordedOutcomes(req, res, next) {
    try {
      const result = await consultationService.listRecordedOutcomes(
        req.businessId,
        req.query
      );
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Consultation outcome history retrieved successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
};
