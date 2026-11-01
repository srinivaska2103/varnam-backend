import { customerService } from '../services/customer.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const customerController = {
  /**
   * Create a customer for authorized business
   */
  async createCustomer(req, res, next) {
    try {
      const businessId = req.businessId;
      const userId = req.user.id;

      const customer = await customerService.createCustomer(businessId, userId, req.body);

      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Customer created successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List customers with pagination, search, and filtering
   */
  async listCustomers(req, res, next) {
    try {
      const businessId = req.businessId;
      const result = await customerService.listCustomers(businessId, req.query);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Customers retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get single customer by ID
   */
  async getCustomerById(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const customer = await customerService.getCustomerById(businessId, id);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Customer profile retrieved successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update permitted customer fields
   */
  async updateCustomer(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const customer = await customerService.updateCustomer(businessId, id, req.body);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Customer updated successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Archive customer
   */
  async archiveCustomer(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const customer = await customerService.archiveCustomer(businessId, id);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Customer archived successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete customer if safe
   */
  async deleteCustomer(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const result = await customerService.deleteCustomer(businessId, id);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: result.message || 'Customer deleted successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};
