import { bookingService } from '../services/booking.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const bookingController = {
  /**
   * Create a new booking
   */
  async createBooking(req, res, next) {
    try {
      const businessId = req.businessId;
      const userId = req.user.id;

      const booking = await bookingService.createBooking(businessId, userId, req.body);

      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Booking created successfully',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List bookings with search and filters
   */
  async listBookings(req, res, next) {
    try {
      const businessId = req.businessId;
      const result = await bookingService.listBookings(businessId, req.query);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Bookings retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Summary metrics for booking dashboard
   */
  async getBookingStats(req, res, next) {
    try {
      const businessId = req.businessId;
      const stats = await bookingService.getBookingStats(businessId);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Booking statistics retrieved successfully',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get single booking details
   */
  async getBookingById(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const booking = await bookingService.getBookingById(businessId, id);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Booking details retrieved successfully',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update permitted booking fields
   */
  async updateBooking(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const booking = await bookingService.updateBooking(businessId, id, req.body);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Booking updated successfully',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update booking workflow status
   */
  async updateBookingStatus(req, res, next) {
    try {
      const businessId = req.businessId;
      const userId = req.user.id;
      const { id } = req.params;

      const booking = await bookingService.updateBookingStatus(businessId, userId, id, req.body);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Booking status updated successfully',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Cancel booking
   */
  async cancelBooking(req, res, next) {
    try {
      const businessId = req.businessId;
      const userId = req.user.id;
      const { id } = req.params;

      const booking = await bookingService.cancelBooking(businessId, userId, id, req.body);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Booking cancelled successfully',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Add ceremony/wedding event to existing booking
   */
  async addBookingEvent(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const event = await bookingService.addBookingEvent(businessId, id, req.body);

      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Booking event added successfully',
        data: event,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Calendar API
   */
  async getCalendarEvents(req, res, next) {
    try {
      const businessId = req.businessId;
      const result = await bookingService.getCalendarEvents(businessId, req.query);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Calendar events retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get payments for booking
   */
  async getBookingPayments(req, res, next) {
    try {
      const businessId = req.businessId;
      const { id } = req.params;

      const payments = await bookingService.getBookingPayments(businessId, id);

      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Booking payments retrieved successfully',
        data: payments,
      });
    } catch (error) {
      next(error);
    }
  },
};
