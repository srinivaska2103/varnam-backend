import { supportService } from '../services/support.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const supportController = {
  // ==========================================
  // HELP ARTICLES
  // ==========================================

  async getCategories(req, res, next) {
    try {
      const categories = await supportService.listCategories();
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Help categories retrieved successfully',
        data: categories,
      });
    } catch (err) {
      next(err);
    }
  },

  async getArticles(req, res, next) {
    try {
      const { search, category, page, limit } = req.query;
      const result = await supportService.listArticles({
        search,
        categorySlug: category,
        page,
        limit,
      });
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Help articles retrieved successfully',
        data: result.articles,
        meta: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  },

  async getArticleBySlug(req, res, next) {
    try {
      const article = await supportService.getArticleBySlug(req.params.slug);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Help article details retrieved',
        data: article,
      });
    } catch (err) {
      next(err);
    }
  },

  async recordArticleFeedback(req, res, next) {
    try {
      const result = await supportService.recordArticleFeedback(
        req.params.id,
        req.user?.id,
        req.businessId,
        req.body
      );
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Feedback recorded successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  // ==========================================
  // USER SUPPORT TICKETS
  // ==========================================

  async createTicket(req, res, next) {
    try {
      const ticket = await supportService.createTicket(
        req.businessId,
        req.user.id,
        req.body
      );
      return ApiResponse.success(res, {
        statusCode: 201,
        message: `Support ticket #${ticket.ticket_number} created successfully`,
        data: ticket,
      });
    } catch (err) {
      next(err);
    }
  },

  async listUserTickets(req, res, next) {
    try {
      const { status, priority, search, page, limit } = req.query;
      const result = await supportService.listUserTickets(req.businessId, {
        status,
        priority,
        search,
        page,
        limit,
      });
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Support tickets retrieved successfully',
        data: result.tickets,
        meta: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  },

  async getUserTicketById(req, res, next) {
    try {
      const ticket = await supportService.getUserTicketById(
        req.businessId,
        req.params.id
      );
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Ticket details retrieved successfully',
        data: ticket,
      });
    } catch (err) {
      next(err);
    }
  },

  async addUserReply(req, res, next) {
    try {
      const reply = await supportService.addUserReply(
        req.businessId,
        req.user.id,
        req.params.id,
        req.body
      );
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Reply submitted successfully',
        data: reply,
      });
    } catch (err) {
      next(err);
    }
  },

  // ==========================================
  // ADMIN SUPPORT MANAGEMENT
  // ==========================================

  async getAdminAnalytics(req, res, next) {
    try {
      const stats = await supportService.getAdminAnalytics();
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Admin support analytics retrieved',
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  },

  async listAdminTickets(req, res, next) {
    try {
      const { status, priority, category, search, page, limit } = req.query;
      const result = await supportService.listAdminTickets({
        status,
        priority,
        category,
        search,
        page,
        limit,
      });
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Admin tickets retrieved successfully',
        data: result.tickets,
        meta: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  },

  async getAdminTicketById(req, res, next) {
    try {
      const ticket = await supportService.getAdminTicketById(req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Admin ticket details retrieved',
        data: ticket,
      });
    } catch (err) {
      next(err);
    }
  },

  async updateAdminTicket(req, res, next) {
    try {
      const ticket = await supportService.updateAdminTicket(
        req.params.id,
        req.user.id,
        req.body
      );
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Ticket updated successfully',
        data: ticket,
      });
    } catch (err) {
      next(err);
    }
  },

  async addAdminReply(req, res, next) {
    try {
      const isInternal = Boolean(req.body.is_internal_note);
      const reply = await supportService.addAdminReply(
        req.params.id,
        req.user.id,
        {
          message: req.body.message,
          is_internal_note: isInternal,
          attachments: req.body.attachments,
        }
      );
      return ApiResponse.success(res, {
        statusCode: 201,
        message: isInternal ? 'Internal note added' : 'Reply sent to user successfully',
        data: reply,
      });
    } catch (err) {
      next(err);
    }
  },

  async createAdminArticle(req, res, next) {
    try {
      const article = await supportService.createAdminArticle(req.user.id, req.body);
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Help article created successfully',
        data: article,
      });
    } catch (err) {
      next(err);
    }
  },

  async updateAdminArticle(req, res, next) {
    try {
      const article = await supportService.updateAdminArticle(req.params.id, req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Help article updated successfully',
        data: article,
      });
    } catch (err) {
      next(err);
    }
  },

  async deleteAdminArticle(req, res, next) {
    try {
      await supportService.deleteAdminArticle(req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Help article deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  },
};

