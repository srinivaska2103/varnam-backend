import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  updateNotificationPreferencesSchema,
  listNotificationsQuerySchema,
} from '../validators/notification.validator.js';

import { requireEntitlement } from '../middleware/entitlement.middleware.js';

const router = Router();

// Protected: All notification management routes require authentication, business membership & entitlement
router.use(authenticate);
router.use(requireBusinessMembership());
router.use(requireEntitlement('NOTIFICATIONS'));

/**
 * Notification preferences
 */
router.get('/preferences', notificationController.getPreferences);

router.patch(
  '/preferences',
  validateRequest(updateNotificationPreferencesSchema),
  notificationController.updatePreferences
);

/**
 * Notification summary metrics
 */
router.get('/summary', notificationController.getSummary);

/**
 * Notification history / logs
 */
router.get(
  '/',
  validateRequest(listNotificationsQuerySchema, 'query'),
  notificationController.listNotifications
);

router.patch('/read-all', notificationController.markAllAsRead);

router.patch('/:id/read', notificationController.markAsRead);

router.post('/:id/retry', notificationController.retryJob);

/**
 * Worker / trigger route for scheduled queue processing
 */
router.post('/process-queue', notificationController.processQueue);

export default router;
