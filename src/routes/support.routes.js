import { Router } from 'express';
import { supportController } from '../controllers/support.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';

const router = Router();

// ==========================================
// PUBLIC / USER HELP ARTICLES (AUTH OPTIONAL/PERMITTED)
// ==========================================

router.get('/categories', supportController.getCategories);
router.get('/articles', supportController.getArticles);
router.get('/articles/:slug', supportController.getArticleBySlug);
router.post('/articles/:id/feedback', authenticate, requireBusinessMembership(), supportController.recordArticleFeedback);

// ==========================================
// USER SUPPORT TICKETS (REQUIRE AUTH & STUDIO MEMBERSHIP)
// ==========================================

router.post('/tickets', authenticate, requireBusinessMembership(), supportController.createTicket);
router.get('/tickets', authenticate, requireBusinessMembership(), supportController.listUserTickets);
router.get('/tickets/:id', authenticate, requireBusinessMembership(), supportController.getUserTicketById);
router.post('/tickets/:id/messages', authenticate, requireBusinessMembership(), supportController.addUserReply);

export default router;

