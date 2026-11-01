import { catalogService } from '../services/catalog.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const serviceController = {
  /**
   * POST /api/services - Create service
   */
  async createService(req, res, next) {
    try {
      const service = await catalogService.createService(req.businessId, req.body);
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Service created successfully',
        data: service,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/services - List services
   */
  async listServices(req, res, next) {
    try {
      const result = await catalogService.listServices(req.businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Services retrieved successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/services/:id - Get service details
   */
  async getServiceById(req, res, next) {
    try {
      const service = await catalogService.getServiceById(req.businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Service details retrieved successfully',
        data: service,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/services/:id - Update service
   */
  async updateService(req, res, next) {
    try {
      const service = await catalogService.updateService(req.businessId, req.params.id, req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Service updated successfully',
        data: service,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/services/:id/archive - Archive service
   */
  async archiveService(req, res, next) {
    try {
      const service = await catalogService.archiveService(req.businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Service archived successfully',
        data: service,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/services/:id - Delete service permanently
   */
  async deleteService(req, res, next) {
    try {
      const result = await catalogService.deleteService(req.businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
};
