import { reportService } from '../services/report.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const reportController = {
  /**
   * Get financial report for the business
   */
  async getFinancialReport(req, res, next) {
    try {
      const businessId = req.businessId;
      const report = await reportService.getFinancialReport(businessId, req.query);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Financial report generated successfully',
        data: report,
      });
    } catch (error) {
      next(error);
    }
  },
};
