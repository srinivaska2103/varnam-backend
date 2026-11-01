import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { requireEntitlement } from '../middleware/entitlement.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  createBookingSchema,
  updateBookingSchema,
  updateBookingStatusSchema,
  cancelBookingSchema,
  bookingEventInputSchema,
  listBookingQuerySchema,
  calendarQuerySchema,
} from '../validators/booking.validator.js';

const router = Router();

// All booking routes require authentication, business membership (Admin only: OWNER, MANAGER), and core BOOKING_MANAGEMENT entitlement
router.use(authenticate);
router.use(requireBusinessMembership(['OWNER', 'MANAGER']));
router.use(requireEntitlement('BOOKING_MANAGEMENT'));

/**
 * Calendar and stats endpoints (Mounted before /:id to prevent route clash)
 */
router.get('/stats', bookingController.getBookingStats);

router.get(
  '/calendar',
  validateRequest(calendarQuerySchema, 'query'),
  bookingController.getCalendarEvents
);

/**
 * Collection endpoints
 */
router.post(
  '/',
  validateRequest(createBookingSchema),
  bookingController.createBooking
);

router.get(
  '/',
  validateRequest(listBookingQuerySchema, 'query'),
  bookingController.listBookings
);

/**
 * Specific booking endpoints
 */
router.get('/:id', bookingController.getBookingById);

router.patch(
  '/:id',
  validateRequest(updateBookingSchema),
  bookingController.updateBooking
);

router.patch(
  '/:id/status',
  validateRequest(updateBookingStatusSchema),
  bookingController.updateBookingStatus
);

router.post(
  '/:id/cancel',
  validateRequest(cancelBookingSchema),
  bookingController.cancelBooking
);

router.post(
  '/:id/events',
  validateRequest(bookingEventInputSchema),
  bookingController.addBookingEvent
);

router.get('/:id/payments', bookingController.getBookingPayments);

export default router;
