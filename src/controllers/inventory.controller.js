import { inventoryService } from '../services/inventory.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const inventoryController = {
  /**
   * POST /api/inventory - Create item
   */
  async createItem(req, res, next) {
    try {
      const item = await inventoryService.createItem(req.businessId, req.body);
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Inventory item created successfully',
        data: item,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/inventory - List items
   */
  async listItems(req, res, next) {
    try {
      const result = await inventoryService.listItems(req.businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Inventory items retrieved successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/inventory/summary - Inventory summary stats
   */
  async getSummary(req, res, next) {
    try {
      const summary = await inventoryService.getInventorySummary(req.businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Inventory summary statistics retrieved successfully',
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/inventory/low-stock - List low stock items
   */
  async getLowStockItems(req, res, next) {
    try {
      const result = await inventoryService.getLowStockItems(req.businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Low stock items retrieved successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/inventory/movements - List stock movements across studio
   */
  async listMovements(req, res, next) {
    try {
      const result = await inventoryService.listMovements(req.businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Stock movements retrieved successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/inventory/:id - Get item details
   */
  async getItemById(req, res, next) {
    try {
      const item = await inventoryService.getItemById(req.businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Inventory item details retrieved successfully',
        data: item,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/inventory/:id - Update item
   */
  async updateItem(req, res, next) {
    try {
      const item = await inventoryService.updateItem(req.businessId, req.params.id, req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Inventory item updated successfully',
        data: item,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/inventory/:id/archive - Archive item
   */
  async archiveItem(req, res, next) {
    try {
      const item = await inventoryService.archiveItem(req.businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Inventory item archived successfully',
        data: item,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/inventory/:id - Delete item
   */
  async deleteItem(req, res, next) {
    try {
      const result = await inventoryService.deleteItem(req.businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/inventory/:id/stock-in - Stock In
   */
  async recordStockIn(req, res, next) {
    try {
      const result = await inventoryService.recordStockIn(
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
   * POST /api/inventory/:id/stock-out - Stock Out
   */
  async recordStockOut(req, res, next) {
    try {
      const result = await inventoryService.recordStockOut(
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
   * POST /api/inventory/:id/adjustments - Stock Adjustment
   */
  async recordStockAdjustment(req, res, next) {
    try {
      const result = await inventoryService.recordStockAdjustment(
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
   * GET /api/inventory/:id/movements - Item stock movement history
   */
  async getItemMovements(req, res, next) {
    try {
      const result = await inventoryService.getItemMovements(
        req.businessId,
        req.params.id,
        req.query
      );
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Item stock movement history retrieved successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
};
