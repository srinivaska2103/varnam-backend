import { enquiryService } from '../services/enquiry.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const enquiryController = {
  /**
   * Create a new bridal enquiry
   */
  async createEnquiry(req, res, next) {
    try {
      const businessId = req.businessId;
      const userId = req.user.id;

      const enquiry = await enquiryService.createEnquiry(businessId, userId, req.body);

      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Enquiry created successfully',
        data: enquiry,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List enquiries with pagination and filters
   */
  async listEnquiries(req, res, next) {
    try {
      const businessId = req.businessId;
      const result = await enquiryService.listEnquiries(businessId, req.query);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Enquiries retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get single enquiry details with activity history
   */
  async getEnquiryById(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const enquiry = await enquiryService.getEnquiryById(businessId, id);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Enquiry details retrieved successfully',
        data: enquiry,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update enquiry fields and validate status transitions
   */
  async updateEnquiry(req, res, next) {
    try {
      const businessId = req.businessId;
      const userId = req.user.id;
      const { id } = req.params;

      const enquiry = await enquiryService.updateEnquiry(businessId, userId, id, req.body);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Enquiry updated successfully',
        data: enquiry,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Record interaction/activity for an enquiry
   */
  async recordActivity(req, res, next) {
    try {
      const businessId = req.businessId;
      const userId = req.user.id;
      const { id } = req.params;

      const activity = await enquiryService.recordActivity(businessId, userId, id, req.body);

      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Enquiry activity recorded successfully',
        data: activity,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get follow-ups list
   */
  async getFollowUps(req, res, next) {
    try {
      const businessId = req.businessId;
      const result = await enquiryService.getFollowUps(businessId, req.query);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Follow-ups retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Complete and schedule next follow-up
   */
  async completeFollowUp(req, res, next) {
    try {
      const businessId = req.businessId;
      const result = await enquiryService.completeAndScheduleFollowUp(
        businessId,
        req.user.id,
        req.params.id,
        req.body
      );

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Follow-up processed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Convert an eligible enquiry into a confirmed booking
   */
  async convertEnquiryToBooking(req, res, next) {
    try {
      const businessId = req.businessId;
      const userId = req.user.id;
      const { id } = req.params;

      const result = await enquiryService.convertEnquiryToBooking(businessId, userId, id, req.body);

      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Enquiry successfully converted to confirmed booking',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get custom enquiry form configuration for current business
   */
  async getFormConfig(req, res, next) {
    try {
      const businessId = req.businessId;
      const result = await enquiryService.getFormConfig(businessId);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Enquiry form configuration retrieved',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update enquiry form configuration for current business
   */
  async updateFormConfig(req, res, next) {
    try {
      const businessId = req.businessId;
      const result = await enquiryService.updateFormConfig(businessId, req.body);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Enquiry form configuration saved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Publish / unpublish form
   */
  async setFormStatus(req, res, next) {
    try {
      const businessId = req.businessId;
      const { status } = req.body;
      const result = await enquiryService.toggleFormPublishStatus(businessId, status);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: `Enquiry form status updated to ${status}`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Public: Get published form by business slug (No auth required)
   */
  async getPublicForm(req, res, next) {
    try {
      const { slug } = req.params;
      const result = await enquiryService.getPublicFormBySlug(slug);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Studio enquiry form retrieved',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Public: Submit enquiry via public form (No auth required)
   */
  async submitPublicForm(req, res, next) {
    try {
      const { slug } = req.params;
      const result = await enquiryService.submitPublicForm(slug, req.body);

      return ApiResponse.success(res, {
        statusCode: 201,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Public: Get date availability for studio/business (No auth required)
   * GET /api/public/forms/:slug/availability?from=YYYY-MM-DD&to=YYYY-MM-DD
   */
  async getPublicAvailability(req, res, next) {
    try {
      const { slug } = req.params;
      const { from, to } = req.query;
      const result = await enquiryService.getPublicAvailability(slug, from, to);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Date availability retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Public: Get available consultation time slots for a given date
   * GET /api/public/forms/:slug/consultation-slots?date=YYYY-MM-DD
   */
  async getPublicConsultationSlots(req, res, next) {
    try {
      const { slug } = req.params;
      const { date } = req.query;
      const result = await enquiryService.getPublicConsultationSlots(slug, date);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Consultation slots retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};
