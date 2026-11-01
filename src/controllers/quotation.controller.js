import { catalogService } from '../services/catalog.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const quotationController = {
  /**
   * POST /api/quotations - Create quotation
   */
  async createQuotation(req, res, next) {
    try {
      const quotation = await catalogService.createQuotation(req.businessId, req.user.id, req.body);
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Quotation created successfully',
        data: quotation,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/quotations - List quotations
   */
  async listQuotations(req, res, next) {
    try {
      const result = await catalogService.listQuotations(req.businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Quotations retrieved successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/quotations/:id - Get quotation details
   */
  async getQuotationById(req, res, next) {
    try {
      const quotation = await catalogService.getQuotationById(req.businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Quotation details retrieved successfully',
        data: quotation,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/quotations/:id - Update quotation
   */
  async updateQuotation(req, res, next) {
    try {
      const quotation = await catalogService.updateQuotation(req.businessId, req.params.id, req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Quotation updated successfully',
        data: quotation,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/quotations/:id/status - Update quotation status
   */
  async updateQuotationStatus(req, res, next) {
    try {
      const quotation = await catalogService.updateQuotationStatus(
        req.businessId,
        req.params.id,
        req.body.status
      );
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Quotation status updated successfully',
        data: quotation,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/quotations/:id/convert-to-booking - Convert quotation to booking
   */
  async convertQuotationToBooking(req, res, next) {
    try {
      const result = await catalogService.convertQuotationToBooking(
        req.businessId,
        req.user.id,
        req.params.id,
        req.body
      );
      return ApiResponse.success(res, {
        statusCode: 201,
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/quotations/:id - Delete quotation
   */
  async deleteQuotation(req, res, next) {
    try {
      const result = await catalogService.deleteQuotation(req.businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Quotation deleted successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
};
