import { websiteService } from '../services/website.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const websiteController = {
  /**
   * Create or update website configuration
   * POST /api/websites or PATCH /api/websites/:businessId
   */
  async upsertWebsite(req, res, next) {
    try {
      const businessId = req.params.businessId || req.businessId;
      const data = await websiteService.upsertWebsite(businessId, req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Website configuration saved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get website configuration
   * GET /api/websites/:businessId
   */
  async getWebsite(req, res, next) {
    try {
      const businessId = req.params.businessId || req.businessId;
      const data = await websiteService.getWebsiteByBusinessId(businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Website configuration retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Publish website
   * PATCH /api/websites/:businessId/publish
   */
  async publishWebsite(req, res, next) {
    try {
      const businessId = req.params.businessId || req.businessId;
      const data = await websiteService.publishWebsite(businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Website published successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Unpublish website
   * PATCH /api/websites/:businessId/unpublish
   */
  async unpublishWebsite(req, res, next) {
    try {
      const businessId = req.params.businessId || req.businessId;
      const data = await websiteService.unpublishWebsite(businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Website unpublished successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Preview website data for authorized users
   * GET /api/websites/:businessId/preview
   */
  async getWebsitePreview(req, res, next) {
    try {
      const businessId = req.params.businessId || req.businessId;
      const data = await websiteService.getWebsitePreview(businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Website preview generated successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // =========================================================================
  // PUBLIC WEBSITE CONTROLLERS
  // =========================================================================

  /**
   * Public: Get published website information (or preview mode if preview=true)
   * GET /api/public/websites/:slug
   */
  async getPublicWebsite(req, res, next) {
    try {
      const { slug } = req.params;
      const isPreview = req.query.preview === 'true';
      const data = await websiteService.getPublicWebsiteBySlug(slug, isPreview);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Published website retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Public: Get active services
   * GET /api/public/websites/:slug/services
   */
  async getPublicServices(req, res, next) {
    try {
      const { slug } = req.params;
      const isPreview = req.query.preview === 'true';
      const data = await websiteService.getPublicServices(slug, isPreview);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Public services retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Public: Get active packages
   * GET /api/public/websites/:slug/packages
   */
  async getPublicPackages(req, res, next) {
    try {
      const { slug } = req.params;
      const isPreview = req.query.preview === 'true';
      const data = await websiteService.getPublicPackages(slug, isPreview);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Public packages retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Public: Get published portfolio items
   * GET /api/public/websites/:slug/portfolio
   */
  async getPublicPortfolio(req, res, next) {
    try {
      const { slug } = req.params;
      const isPreview = req.query.preview === 'true';
      const data = await websiteService.getPublicPortfolio(slug, isPreview);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Public portfolio items retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Public: Submit enquiry form
   * POST /api/public/websites/:slug/enquiries
   */
  async submitPublicEnquiry(req, res, next) {
    try {
      const { slug } = req.params;
      const result = await websiteService.submitPublicEnquiry(slug, req.body);
      return ApiResponse.success(res, {
        statusCode: 201,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Public: Submit consultation request
   * POST /api/public/websites/:slug/consultation-requests
   */
  async submitPublicConsultation(req, res, next) {
    try {
      const { slug } = req.params;
      const result = await websiteService.submitPublicConsultation(slug, req.body);
      return ApiResponse.success(res, {
        statusCode: 201,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  // =========================================================================
  // PORTFOLIO CONTROLLERS (Protected)
  // =========================================================================

  /**
   * Create portfolio item
   * POST /api/portfolio
   */
  async createPortfolioItem(req, res, next) {
    try {
      const businessId = req.businessId;
      const data = await websiteService.createPortfolioItem(businessId, req.body);
      return ApiResponse.success(res, {
        statusCode: 201,
        message: 'Portfolio item created successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List portfolio items for business
   * GET /api/portfolio
   */
  async listPortfolio(req, res, next) {
    try {
      const businessId = req.businessId;
      const data = await websiteService.listPortfolio(businessId, req.query);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Portfolio items retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get portfolio item details
   * GET /api/portfolio/:id
   */
  async getPortfolioItemById(req, res, next) {
    try {
      const businessId = req.businessId;
      const data = await websiteService.getPortfolioItemById(businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Portfolio item retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update portfolio item
   * PATCH /api/portfolio/:id
   */
  async updatePortfolioItem(req, res, next) {
    try {
      const businessId = req.businessId;
      const data = await websiteService.updatePortfolioItem(businessId, req.params.id, req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Portfolio item updated successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Publish portfolio item
   * PATCH /api/portfolio/:id/publish
   */
  async publishPortfolioItem(req, res, next) {
    try {
      const businessId = req.businessId;
      const data = await websiteService.publishPortfolioItem(businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Portfolio item published successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Archive portfolio item
   * PATCH /api/portfolio/:id/archive
   */
  async archivePortfolioItem(req, res, next) {
    try {
      const businessId = req.businessId;
      const data = await websiteService.archivePortfolioItem(businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Portfolio item archived successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete portfolio item
   * DELETE /api/portfolio/:id
   */
  async deletePortfolioItem(req, res, next) {
    try {
      const businessId = req.businessId;
      const data = await websiteService.deletePortfolioItem(businessId, req.params.id);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Portfolio item deleted successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get studio business hours
   * GET /api/websites/:businessId/hours
   */
  async getBusinessHours(req, res, next) {
    try {
      const businessId = req.params.businessId || req.businessId;
      const data = await websiteService.getBusinessHours(businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Business hours retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update studio business hours
   * PUT /api/websites/:businessId/hours
   */
  async updateBusinessHours(req, res, next) {
    try {
      const businessId = req.params.businessId || req.businessId;
      const data = await websiteService.updateBusinessHours(businessId, req.body.hours);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Business hours updated successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get studio about section
   * GET /api/websites/:businessId/about
   */
  async getStudioAboutSection(req, res, next) {
    try {
      const businessId = req.params.businessId || req.businessId;
      const data = await websiteService.getStudioAboutSection(businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'About section retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update or create studio about section
   * POST /api/websites/:businessId/about
   */
  async upsertStudioAboutSection(req, res, next) {
    try {
      const businessId = req.params.businessId || req.businessId;
      const data = await websiteService.upsertStudioAboutSection(businessId, req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'About section updated successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get website footer settings
   * GET /api/websites/:businessId/footer
   */
  async getFooterSettings(req, res, next) {
    try {
      const businessId = req.params.businessId || req.businessId;
      const data = await websiteService.getFooterSettings(businessId);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Footer settings retrieved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update or create website footer settings
   * PUT /api/websites/:businessId/footer
   */
  async upsertFooterSettings(req, res, next) {
    try {
      const businessId = req.params.businessId || req.businessId;
      const data = await websiteService.upsertFooterSettings(businessId, req.body);
      return ApiResponse.success(res, {
        statusCode: 200,
        message: 'Footer settings saved successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  },
};


