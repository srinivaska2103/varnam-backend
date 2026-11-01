import { expenseService } from '../services/expense.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const expenseController = {
  /**
   * Create new studio expense
   */
  async createExpense(req, res, next) {
    try {
      const businessId = req.businessId;
      const userId = req.user.id;

      const expense = await expenseService.createExpense(businessId, userId, req.body);

      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Expense recorded successfully',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List expenses with category and date filtering
   */
  async listExpenses(req, res, next) {
    try {
      const businessId = req.businessId;
      const result = await expenseService.listExpenses(businessId, req.query);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Expenses retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get single expense details
   */
  async getExpenseById(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      if (id === 'summary') {
        const summary = await expenseService.getExpenseSummary(businessId, req.query);
        return ApiResponse.success(res, {
          statusCode: 200,
          message: 'Expense summary retrieved successfully',
          data: summary,
        });
      }

      if (id === 'categories') {
        const categories = await expenseService.getExpenseCategories(businessId);
        return ApiResponse.success(res, {
          statusCode: 200,
          message: 'Expense categories retrieved successfully',
          data: categories,
        });
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return ApiResponse.error(res, {
          statusCode: 404,
          message: 'Invalid expense ID format',
        });
      }

      const expense = await expenseService.getExpenseById(businessId, id);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Expense details retrieved successfully',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update permitted expense fields
   */
  async updateExpense(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const expense = await expenseService.updateExpense(businessId, id, req.body);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Expense updated successfully',
        data: expense,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Archive / Void an expense record
   */
  async archiveExpense(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const result = await expenseService.archiveExpense(businessId, id);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Expense archived successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete an expense permanently
   */
  async deleteExpense(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const result = await expenseService.deleteExpense(businessId, id);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Expense deleted successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get expense summary & category analytics
   */
  async getExpenseSummary(req, res, next) {
    try {
      const businessId = req.businessId;
      const result = await expenseService.getExpenseSummary(businessId, req.query);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Expense summary retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List expense categories
   */
  async getExpenseCategories(req, res, next) {
    try {
      const businessId = req.businessId;
      const result = await expenseService.getExpenseCategories(businessId);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Expense categories retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};

