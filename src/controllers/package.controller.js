import { catalogService } from '../services/catalog.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const packageController = {
  /**
   * POST /api/packages - Create package
   */
  async createPackage(req, res, next) {
    try {
      const pkg = await catalogService.createPackage(req.businessId, req.body);
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Package created successfully',
        data: pkg,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/packages - List packages
   */
  async listPackages(req, res, next) {
    try {
      const result = await catalogService.listPackages(req.businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Packages retrieved successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/packages/:id - Get package details
   */
  async getPackageById(req, res, next) {
    try {
      const pkg = await catalogService.getPackageById(req.businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Package details retrieved successfully',
        data: pkg,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/packages/:id - Update package
   */
  async updatePackage(req, res, next) {
    try {
      const pkg = await catalogService.updatePackage(req.businessId, req.params.id, req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Package updated successfully',
        data: pkg,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/packages/:id/archive - Archive package
   */
  async archivePackage(req, res, next) {
    try {
      const pkg = await catalogService.archivePackage(req.businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Package archived successfully',
        data: pkg,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/packages/:id/services - Add service to package
   */
  async addServiceToPackage(req, res, next) {
    try {
      const result = await catalogService.addPackageService(req.businessId, req.params.id, req.body);
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Service added to package successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/packages/:id - Delete package
   */
  async deletePackage(req, res, next) {
    try {
      const result = await catalogService.deletePackage(req.businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Package deleted successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/packages/:id/services/:serviceId - Remove service from package
   */
  async removeServiceFromPackage(req, res, next) {
    try {
      const result = await catalogService.removePackageService(
        req.businessId,
        req.params.id,
        req.params.serviceId
      );
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Service removed from package successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
};
