import { paymentService } from '../services/payment.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const paymentController = {
  /**
   * Record a new manual payment
   */
  async recordPayment(req, res, next) {
    try {
      const businessId = req.businessId;
      const userId = req.user.id;

      const payment = await paymentService.recordPayment(businessId, userId, req.body);

      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Payment recorded successfully',
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Record a customer refund for a cancelled booking
   */
  async recordCustomerRefund(req, res, next) {
    try {
      const businessId = req.businessId;
      const userId = req.user.id;

      const refund = await paymentService.recordCustomerRefund(businessId, userId, req.body);

      return ApiResponse.success(res, {
        statusCode: 201,
        message: refund.status === 'REFUNDED' ? 'Refund completed successfully' : 'Refund recorded as pending',
        data: refund,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get refund eligibility and financial summary for a booking
   */
  async getBookingRefundEligibility(req, res, next) {
    try {
      const businessId = req.businessId;
      const { bookingId } = req.params;

      const eligibility = await paymentService.getBookingRefundEligibility(businessId, bookingId);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Refund eligibility retrieved successfully',
        data: eligibility,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Approve refundable amount for a cancelled booking
   */
  async approveBookingRefund(req, res, next) {
    try {
      const businessId = req.businessId;
      const userId = req.user.id;
      const { bookingId } = req.params;

      const result = await paymentService.approveBookingRefund(businessId, userId, bookingId, req.body);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Refundable amount approved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List payments with pagination and filters
   */
  async listPayments(req, res, next) {
    try {
      const businessId = req.businessId;
      const result = await paymentService.listPayments(businessId, req.query);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Payments retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get single payment record
   */
  async getPaymentById(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      if (id === 'metrics') {
        const metrics = await paymentService.getPaymentMetrics(businessId, req.query);
        return ApiResponse.success(res, {
          statusCode: 200,
          message: 'Payment metrics retrieved successfully',
          data: metrics,
        });
      }

      // UUID check
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return ApiResponse.error(res, {
          statusCode: 404,
          message: 'Invalid payment ID format',
        });
      }

      const payment = await paymentService.getPaymentById(businessId, id);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Payment details retrieved successfully',
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Generate payment receipt
   */
  async getPaymentReceipt(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const receipt = await paymentService.getPaymentReceipt(businessId, id);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Payment receipt generated successfully',
        data: receipt,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Process refund for a payment
   */
  async refundPayment(req, res, next) {
    try {
      const businessId = req.businessId;
      const userId = req.user.id;
      const { id } = req.params;

      const result = await paymentService.refundPayment(businessId, userId, id, req.body);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Payment refund processed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get booking payment reconciliation history
   */
  async getBookingPayments(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const result = await paymentService.getBookingPayments(businessId, id);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Booking payment history retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get payment summary metrics (total collected, today's collection, advance, outstanding)
   */
  async getPaymentMetrics(req, res, next) {
    try {
      const businessId = req.businessId;
      const metrics = await paymentService.getPaymentMetrics(businessId, req.query);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Payment metrics retrieved successfully',
        data: metrics,
      });
    } catch (error) {
      next(error);
    }
  },
};
