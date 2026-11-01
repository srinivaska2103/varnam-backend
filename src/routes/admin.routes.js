import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireSuperAdmin } from '../middleware/admin.middleware.js';
import { adminController } from '../controllers/admin.controller.js';
import { supportController } from '../controllers/support.controller.js';

const router = Router();

/**
 * Super Admin OTP Authentication Endpoints (Pre-auth)
 * POST /api/admin/auth/request-otp
 * POST /api/admin/auth/verify-otp
 */
router.post('/auth/request-otp', adminController.requestOtp);
router.post('/auth/verify-otp', adminController.verifyOtp);

// Apply authentication and strict Super Admin role guard to ALL protected admin routes
router.use(authenticate, requireSuperAdmin);

/**
 * 1. Overview Dashboard Analytics
 * GET /api/admin/dashboard
 */
router.get('/dashboard', adminController.getDashboard);

/**
 * 2. Revenue Analytics & Charting
 * GET /api/admin/revenue
 */
router.get('/revenue', adminController.getRevenue);

/**
 * 3. Accounts Management
 * GET /api/admin/accounts
 * GET /api/admin/accounts/:id
 * PATCH /api/admin/accounts/:id/status
 */
router.get('/accounts', adminController.getAccounts);
router.get('/accounts/:id', adminController.getAccountById);
router.patch('/accounts/:id/status', adminController.updateAccountStatus);

/**
 * 4. Subscriptions Management
 * GET /api/admin/subscriptions
 */
router.get('/subscriptions', adminController.getSubscriptions);

/**
 * 5. Payments Management (Razorpay & Verified Subscription Orders)
 * GET /api/admin/payments
 */
router.get('/payments', adminController.getPayments);

/**
 * 6. Commercial Plans Configuration
 * GET /api/admin/plans
 */
router.get('/plans', adminController.getPlans);

/**
 * 7. Sales & Premium Enquiries Management
 * GET /api/admin/enquiries
 * PATCH /api/admin/enquiries/:id
 */
router.get('/enquiries', adminController.getPremiumEnquiries);
router.patch('/enquiries/:id', adminController.updatePremiumEnquiry);

/**
 * 8. Reports & Exports
 * GET /api/admin/reports
 */
router.get('/reports', adminController.getReports);

/**
 * 9. Platform Activity & Audit Logs
 * GET /api/admin/activity
 */
router.get('/activity', adminController.getActivityLogs);

/**
 * 10. Help Center & Support Ticket Management (VEXA TECH Platform Admin)
 */
router.get('/support/analytics', supportController.getAdminAnalytics);
router.get('/support/tickets', supportController.listAdminTickets);
router.get('/support/tickets/:id', supportController.getAdminTicketById);
router.patch('/support/tickets/:id', supportController.updateAdminTicket);
router.post('/support/tickets/:id/messages', supportController.addAdminReply);
router.post('/support/tickets/:id/internal-notes', (req, res, next) => {
  req.body.is_internal_note = true;
  return supportController.addAdminReply(req, res, next);
});
router.post('/support/articles', supportController.createAdminArticle);
router.patch('/support/articles/:id', supportController.updateAdminArticle);
router.delete('/support/articles/:id', supportController.deleteAdminArticle);

export default router;
