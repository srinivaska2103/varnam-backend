import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

// Quotation status transitions
const VALID_QUOTATION_TRANSITIONS = {
  DRAFT: ['SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED'],
  SENT: ['DRAFT', 'ACCEPTED', 'DECLINED', 'EXPIRED'],
  ACCEPTED: ['DRAFT', 'SENT', 'DECLINED', 'EXPIRED'],
  DECLINED: ['DRAFT', 'SENT'],
  EXPIRED: ['DRAFT', 'SENT'],
};

/**
 * Generates URL-friendly slug
 */
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * Normalizes HH:MM or HH:MM:SS string to Date object on 1970-01-01 for PostgreSQL Time(6) field
 */
function parseTimeString(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  return new Date(Date.UTC(1970, 0, 1, parseInt(parts[0], 10), parseInt(parts[1], 10), parts[2] ? parseInt(parts[2], 10) : 0));
}

export const catalogService = {
  // ==========================================
  // 1. SERVICES MANAGEMENT
  // ==========================================

  /**
   * Create a service
   */
  async createService(businessId, data) {
    const existing = await prisma.services.findUnique({
      where: {
        business_id_name: {
          business_id: businessId,
          name: data.name,
        },
      },
    });

    if (existing) {
      throw ApiError.conflict(`Service with name "${data.name}" already exists in your business`);
    }

    const service = await prisma.services.create({
      data: {
        business_id: businessId,
        name: data.name,
        description: data.description || null,
        default_price_paise: BigInt(data.default_price_paise || 0),
        duration_minutes: data.duration_minutes || null,
        is_active: data.is_active !== undefined ? data.is_active : true,
      },
    });

    return {
      ...service,
      default_price_paise: Number(service.default_price_paise),
    };
  },

  /**
   * List services with pagination, search, and status filters
   */
  async listServices(businessId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = { business_id: businessId };

    if (query.is_active !== undefined) {
      where.is_active = typeof query.is_active === 'string'
        ? query.is_active.toLowerCase() === 'true'
        : Boolean(query.is_active);
    }

    if (query.search && query.search.trim()) {
      where.OR = [
        { name: { contains: query.search.trim(), mode: 'insensitive' } },
        { description: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    const [total, services] = await Promise.all([
      prisma.services.count({ where }),
      prisma.services.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          package_services: {
            include: {
              packages: {
                select: {
                  id: true,
                  name: true,
                  price_paise: true,
                  is_active: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      services: services.map((s) => ({
        ...s,
        default_price_paise: Number(s.default_price_paise),
        package_services: (s.package_services || []).map((ps) => ({
          ...ps,
          packages: ps.packages
            ? {
                ...ps.packages,
                price_paise: Number(ps.packages.price_paise),
              }
            : null,
        })),
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get service details by ID
   */
  async getServiceById(businessId, serviceId) {
    const service = await prisma.services.findFirst({
      where: {
        id: serviceId,
        business_id: businessId,
      },
      include: {
        package_services: {
          include: {
            packages: {
              select: {
                id: true,
                name: true,
                price_paise: true,
                is_active: true,
              },
            },
          },
        },
      },
    });

    if (!service) {
      throw ApiError.notFound('Service not found in this business');
    }

    return {
      ...service,
      default_price_paise: Number(service.default_price_paise),
      package_services: service.package_services.map((ps) => ({
        ...ps,
        packages: ps.packages
          ? {
              ...ps.packages,
              price_paise: Number(ps.packages.price_paise),
            }
          : null,
      })),
    };
  },

  /**
   * Update service details
   */
  async updateService(businessId, serviceId, data) {
    await this.getServiceById(businessId, serviceId);

    if (data.name) {
      const duplicate = await prisma.services.findFirst({
        where: {
          business_id: businessId,
          name: data.name,
          id: { not: serviceId },
        },
      });

      if (duplicate) {
        throw ApiError.conflict(`Another service named "${data.name}" already exists`);
      }
    }

    const updated = await prisma.services.update({
      where: { id: serviceId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.default_price_paise !== undefined ? { default_price_paise: BigInt(data.default_price_paise) } : {}),
        ...(data.duration_minutes !== undefined ? { duration_minutes: data.duration_minutes } : {}),
        ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
      },
    });

    return {
      ...updated,
      default_price_paise: Number(updated.default_price_paise),
    };
  },

  /**
   * Archive service (soft delete via is_active = false)
   */
  async archiveService(businessId, serviceId) {
    await this.getServiceById(businessId, serviceId);

    const updated = await prisma.services.update({
      where: { id: serviceId },
      data: { is_active: false },
    });

    return {
      ...updated,
      default_price_paise: Number(updated.default_price_paise),
      archived: true,
    };
  },

  /**
   * Delete service permanently if not linked to packages
   */
  async deleteService(businessId, serviceId) {
    const service = await prisma.services.findFirst({
      where: {
        id: serviceId,
        business_id: businessId,
      },
      include: {
        package_services: {
          include: {
            packages: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!service) {
      throw ApiError.notFound('Service not found in this business');
    }

    if (service.package_services && service.package_services.length > 0) {
      const packageNames = service.package_services
        .map((ps) => ps.packages?.name || 'Package')
        .filter(Boolean)
        .join(', ');
      throw ApiError.badRequest(
        `Cannot delete this service because it is linked to package(s): ${packageNames}. Please archive the service or remove it from the package(s) first.`
      );
    }

    await prisma.services.delete({
      where: { id: serviceId },
    });

    return {
      id: serviceId,
      deleted: true,
      message: 'Service deleted successfully',
    };
  },

  // ==========================================
  // 2. PACKAGES MANAGEMENT
  // ==========================================

  /**
   * Create a package
   */
  async createPackage(businessId, data) {
    const existing = await prisma.packages.findUnique({
      where: {
        business_id_name: {
          business_id: businessId,
          name: data.name,
        },
      },
    });

    if (existing) {
      throw ApiError.conflict(`Package with name "${data.name}" already exists in your business`);
    }

    let baseSlug = data.slug ? slugify(data.slug) : slugify(data.name);
    let finalSlug = baseSlug || `package-${crypto.randomBytes(3).toString('hex')}`;

    // Ensure slug uniqueness within business
    const existingSlug = await prisma.packages.findUnique({
      where: {
        business_id_slug: {
          business_id: businessId,
          slug: finalSlug,
        },
      },
    });

    if (existingSlug) {
      finalSlug = `${finalSlug}-${crypto.randomBytes(2).toString('hex')}`;
    }

    // Verify services if initial services array is provided
    let verifiedServices = [];
    if (data.services && data.services.length > 0) {
      for (const item of data.services) {
        if (item.service_id) {
          const s = await prisma.services.findFirst({
            where: { id: item.service_id, business_id: businessId },
          });
          if (!s) {
            throw ApiError.badRequest(`Service ${item.service_id} does not exist in your business`);
          }
          verifiedServices.push({
            service_id: s.id,
            service_name_snapshot: item.service_name_snapshot || s.name,
            quantity: item.quantity || 1,
            notes: item.notes || null,
          });
        } else {
          if (!item.service_name_snapshot) {
            throw ApiError.badRequest('Service name snapshot is required when service_id is not specified');
          }
          verifiedServices.push({
            service_id: null,
            service_name_snapshot: item.service_name_snapshot,
            quantity: item.quantity || 1,
            notes: item.notes || null,
          });
        }
      }
    }

    const createdPackage = await prisma.$transaction(async (tx) => {
      const pkg = await tx.packages.create({
        data: {
          business_id: businessId,
          name: data.name,
          slug: finalSlug,
          description: data.description || null,
          price_paise: BigInt(data.price_paise || 0),
          currency: data.currency || 'INR',
          is_public: data.is_public !== undefined ? data.is_public : false,
          is_active: data.is_active !== undefined ? data.is_active : true,
          display_order: data.display_order || 0,
          cover_image_url: data.cover_image_url || null,
        },
      });

      for (const s of verifiedServices) {
        await tx.package_services.create({
          data: {
            business_id: businessId,
            package_id: pkg.id,
            service_id: s.service_id,
            service_name_snapshot: s.service_name_snapshot,
            quantity: s.quantity,
            notes: s.notes,
          },
        });
      }

      return pkg;
    });

    return this.getPackageById(businessId, createdPackage.id);
  },

  /**
   * List packages with pagination, search, and status filters
   */
  async listPackages(businessId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = { business_id: businessId };

    if (query.is_active !== undefined) {
      where.is_active = typeof query.is_active === 'string'
        ? query.is_active.toLowerCase() === 'true'
        : Boolean(query.is_active);
    }
    if (query.is_public !== undefined) {
      where.is_public = typeof query.is_public === 'string'
        ? query.is_public.toLowerCase() === 'true'
        : Boolean(query.is_public);
    }

    if (query.search && query.search.trim()) {
      where.OR = [
        { name: { contains: query.search.trim(), mode: 'insensitive' } },
        { description: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    const [total, packages] = await Promise.all([
      prisma.packages.count({ where }),
      prisma.packages.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ display_order: 'asc' }, { created_at: 'desc' }],
        include: {
          package_services: {
            include: {
              services: {
                select: {
                  id: true,
                  name: true,
                  default_price_paise: true,
                  duration_minutes: true,
                  is_active: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      packages: packages.map((pkg) => ({
        ...pkg,
        price_paise: Number(pkg.price_paise),
        package_services: pkg.package_services.map((ps) => ({
          ...ps,
          services: ps.services
            ? {
                ...ps.services,
                default_price_paise: Number(ps.services.default_price_paise),
              }
            : null,
        })),
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get package details and included services
   */
  async getPackageById(businessId, packageId) {
    const pkg = await prisma.packages.findFirst({
      where: {
        id: packageId,
        business_id: businessId,
      },
      include: {
        package_services: {
          include: {
            services: {
              select: {
                id: true,
                name: true,
                description: true,
                default_price_paise: true,
                duration_minutes: true,
                is_active: true,
              },
            },
          },
        },
      },
    });

    if (!pkg) {
      throw ApiError.notFound('Package not found in this business');
    }

    return {
      ...pkg,
      price_paise: Number(pkg.price_paise),
      package_services: pkg.package_services.map((ps) => ({
        ...ps,
        services: ps.services
          ? {
              ...ps.services,
              default_price_paise: Number(ps.services.default_price_paise),
            }
          : null,
      })),
    };
  },

  /**
   * Update package details
   */
  async updatePackage(businessId, packageId, data) {
    await this.getPackageById(businessId, packageId);

    if (data.name) {
      const duplicate = await prisma.packages.findFirst({
        where: {
          business_id: businessId,
          name: data.name,
          id: { not: packageId },
        },
      });

      if (duplicate) {
        throw ApiError.conflict(`Another package named "${data.name}" already exists`);
      }
    }

    let finalSlug = undefined;
    if (data.slug) {
      finalSlug = slugify(data.slug);
      const duplicateSlug = await prisma.packages.findFirst({
        where: {
          business_id: businessId,
          slug: finalSlug,
          id: { not: packageId },
        },
      });
      if (duplicateSlug) {
        throw ApiError.conflict(`Another package with slug "${finalSlug}" already exists`);
      }
    }

    // If data.services provided, verify and update included services in transaction
    let verifiedServices = null;
    if (data.services !== undefined) {
      verifiedServices = [];
      if (Array.isArray(data.services) && data.services.length > 0) {
        for (const item of data.services) {
          if (item.service_id) {
            const s = await prisma.services.findFirst({
              where: { id: item.service_id, business_id: businessId },
            });
            if (!s) {
              throw ApiError.badRequest(`Service ${item.service_id} does not exist in your business`);
            }
            verifiedServices.push({
              service_id: s.id,
              service_name_snapshot: item.service_name_snapshot || s.name,
              quantity: item.quantity || 1,
              notes: item.notes || null,
            });
          } else {
            if (!item.service_name_snapshot) {
              throw ApiError.badRequest('Service name snapshot is required when service_id is not specified');
            }
            verifiedServices.push({
              service_id: null,
              service_name_snapshot: item.service_name_snapshot,
              quantity: item.quantity || 1,
              notes: item.notes || null,
            });
          }
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.packages.update({
        where: { id: packageId },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(finalSlug ? { slug: finalSlug } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.price_paise !== undefined ? { price_paise: BigInt(data.price_paise) } : {}),
          ...(data.currency ? { currency: data.currency } : {}),
          ...(data.is_public !== undefined ? { is_public: data.is_public } : {}),
          ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
          ...(data.display_order !== undefined ? { display_order: data.display_order } : {}),
          ...(data.cover_image_url !== undefined ? { cover_image_url: data.cover_image_url } : {}),
        },
      });

      if (verifiedServices !== null) {
        await tx.package_services.deleteMany({
          where: { package_id: packageId, business_id: businessId },
        });

        for (const s of verifiedServices) {
          await tx.package_services.create({
            data: {
              business_id: businessId,
              package_id: packageId,
              service_id: s.service_id,
              service_name_snapshot: s.service_name_snapshot,
              quantity: s.quantity,
              notes: s.notes,
            },
          });
        }
      }
    });

    return this.getPackageById(businessId, packageId);
  },

  /**
   * Archive package (soft delete via is_active = false)
   */
  async archivePackage(businessId, packageId) {
    await this.getPackageById(businessId, packageId);

    const updated = await prisma.packages.update({
      where: { id: packageId },
      data: { is_active: false },
    });

    return {
      ...updated,
      price_paise: Number(updated.price_paise),
      archived: true,
    };
  },

  /**
   * Delete package permanently if safe (no bookings or enquiries reference it)
   */
  async deletePackage(businessId, packageId) {
    const pkg = await prisma.packages.findFirst({
      where: { id: packageId, business_id: businessId },
      include: {
        bookings: { select: { id: true } },
        enquiries: { select: { id: true } },
      },
    });

    if (!pkg) {
      throw ApiError.notFound('Package not found in this business');
    }

    if (pkg.bookings && pkg.bookings.length > 0) {
      throw ApiError.badRequest(
        `Cannot delete package "${pkg.name}" because it is referenced by ${pkg.bookings.length} existing booking(s). Please archive it instead to preserve client records.`
      );
    }

    if (pkg.enquiries && pkg.enquiries.length > 0) {
      throw ApiError.badRequest(
        `Cannot delete package "${pkg.name}" because it is referenced by ${pkg.enquiries.length} enquiry record(s). Please archive it instead to preserve lead history.`
      );
    }

    // Delete package (cascade deletes package_services)
    await prisma.packages.delete({
      where: { id: packageId },
    });

    return {
      id: packageId,
      deleted: true,
      message: 'Package removed successfully',
    };
  },

  /**
   * Add a service to a package
   */
  async addPackageService(businessId, packageId, data) {
    // 1. Validate package belongs to this business
    await this.getPackageById(businessId, packageId);

    let serviceName = data.service_name_snapshot;
    let serviceId = data.service_id || null;

    // 2. If service_id provided, validate service belongs to SAME business
    if (serviceId) {
      const service = await prisma.services.findFirst({
        where: {
          id: serviceId,
          business_id: businessId,
        },
      });

      if (!service) {
        throw ApiError.badRequest('Service does not belong to your business or does not exist');
      }

      if (!serviceName) {
        serviceName = service.name;
      }
    }

    if (!serviceName) {
      throw ApiError.badRequest('Service name snapshot is required');
    }

    // Check if service already in package
    const existing = await prisma.package_services.findUnique({
      where: {
        package_id_service_name_snapshot: {
          package_id: packageId,
          service_name_snapshot: serviceName,
        },
      },
    });

    if (existing) {
      // Update quantity if already exists
      const updated = await prisma.package_services.update({
        where: { id: existing.id },
        data: {
          quantity: data.quantity || existing.quantity,
          notes: data.notes !== undefined ? data.notes : existing.notes,
        },
      });
      return updated;
    }

    const created = await prisma.package_services.create({
      data: {
        business_id: businessId,
        package_id: packageId,
        service_id: serviceId,
        service_name_snapshot: serviceName,
        quantity: data.quantity || 1,
        notes: data.notes || null,
      },
    });

    return created;
  },

  /**
   * Remove a service from a package
   */
  async removePackageService(businessId, packageId, serviceId) {
    // Validate package ownership
    await this.getPackageById(businessId, packageId);

    // Find the link either by service_id or by package_services.id
    const packageService = await prisma.package_services.findFirst({
      where: {
        package_id: packageId,
        business_id: businessId,
        OR: [
          { service_id: serviceId },
          { id: serviceId },
        ],
      },
    });

    if (!packageService) {
      throw ApiError.notFound('Service is not in this package');
    }

    await prisma.package_services.delete({
      where: { id: packageService.id },
    });

    return { removed: true, service_id: serviceId };
  },

  // ==========================================
  // 3. QUOTATIONS MANAGEMENT
  // ==========================================

  /**
   * Server-side calculation of line items and quote totals
   * Never trust client totals
   */
  calculateQuotationTotals(items, discountPaise = 0, taxPaise = 0) {
    let subtotalPaise = BigInt(0);

    const calculatedItems = items.map((item) => {
      const qty = Number(item.quantity) || 1;
      const unitPrice = BigInt(item.unit_price_paise || 0);
      // line_total = Math.round(qty * unitPrice)
      const lineTotal = BigInt(Math.round(qty * Number(unitPrice)));
      subtotalPaise += lineTotal;

      return {
        ...item,
        quantity: qty,
        unit_price_paise: unitPrice,
        line_total_paise: lineTotal,
      };
    });

    const discount = BigInt(discountPaise || 0);
    const tax = BigInt(taxPaise || 0);

    let totalPaise = subtotalPaise - discount + tax;
    if (totalPaise < BigInt(0)) {
      totalPaise = BigInt(0);
    }

    return {
      calculatedItems,
      subtotal_paise: subtotalPaise,
      discount_paise: discount,
      tax_paise: tax,
      total_paise: totalPaise,
    };
  },

  /**
   * Create a quotation
   */
  async createQuotation(businessId, userId, data) {
    // 1. Verify customer belongs to same business if provided
    if (data.customer_id) {
      const customer = await prisma.customers.findFirst({
        where: { id: data.customer_id, business_id: businessId },
      });
      if (!customer) {
        throw ApiError.badRequest('Customer does not belong to your business');
      }
    }

    // 2. Verify enquiry belongs to same business if provided
    if (data.enquiry_id) {
      const enquiry = await prisma.enquiries.findFirst({
        where: { id: data.enquiry_id, business_id: businessId },
      });
      if (!enquiry) {
        throw ApiError.badRequest('Enquiry does not belong to your business');
      }
    }

    // 3. Verify services and packages referenced in items belong to same business
    for (const item of data.items) {
      if (item.service_id) {
        const s = await prisma.services.findFirst({
          where: { id: item.service_id, business_id: businessId },
        });
        if (!s) {
          throw ApiError.badRequest(`Service ${item.service_id} does not belong to your business`);
        }
      }
      if (item.package_id) {
        const p = await prisma.packages.findFirst({
          where: { id: item.package_id, business_id: businessId },
        });
        if (!p) {
          throw ApiError.badRequest(`Package ${item.package_id} does not belong to your business`);
        }
      }
    }

    // 4. Calculate totals on server
    const { calculatedItems, subtotal_paise, discount_paise, tax_paise, total_paise } =
      this.calculateQuotationTotals(data.items, data.discount_paise, data.tax_paise);

    const quotationNumber =
      data.quotation_number ||
      `QT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    // 5. Create quotation & items in atomic transaction
    const quotation = await prisma.$transaction(async (tx) => {
      const q = await tx.quotations.create({
        data: {
          business_id: businessId,
          customer_id: data.customer_id || null,
          enquiry_id: data.enquiry_id || null,
          quotation_number: quotationNumber,
          status: 'DRAFT',
          subtotal_paise,
          discount_paise,
          tax_paise,
          total_paise,
          valid_until: data.valid_until ? new Date(`${data.valid_until}T00:00:00.000Z`) : null,
          terms: data.terms || null,
          created_by: userId,
        },
      });

      for (const item of calculatedItems) {
        await tx.quotation_items.create({
          data: {
            quotation_id: q.id,
            description: item.description,
            quantity: item.quantity,
            unit_price_paise: item.unit_price_paise,
            line_total_paise: item.line_total_paise,
          },
        });
      }

      return q;
    });

    return this.getQuotationById(businessId, quotation.id);
  },

  /**
   * List quotations with pagination, search, and status filters
   */
  async listQuotations(businessId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = { business_id: businessId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.customer_id) {
      where.customer_id = query.customer_id;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { quotation_number: { contains: term, mode: 'insensitive' } },
        { customers: { full_name: { contains: term, mode: 'insensitive' } } },
        { customers: { phone: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [total, quotations] = await Promise.all([
      prisma.quotations.count({ where }),
      prisma.quotations.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          customers: {
            select: { id: true, full_name: true, phone: true, email: true },
          },
          enquiries: {
            select: { id: true, customer_name: true, event_kind: true, event_date: true },
          },
          quotation_items: true,
          bookings: {
            select: { id: true, booking_number: true, status: true },
          },
        },
      }),
    ]);

    return {
      quotations: quotations.map((q) => this.serializeQuotation(q)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get quotation details and items
   */
  async getQuotationById(businessId, quotationId) {
    const quotation = await prisma.quotations.findFirst({
      where: {
        id: quotationId,
        business_id: businessId,
      },
      include: {
        customers: {
          select: { id: true, full_name: true, phone: true, email: true, address: true, city: true },
        },
        enquiries: {
          select: { id: true, customer_name: true, event_kind: true, event_date: true, status: true },
        },
        quotation_items: true,
        bookings: {
          select: { id: true, booking_number: true, status: true, created_at: true },
        },
        users: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!quotation) {
      throw ApiError.notFound('Quotation not found in this business');
    }

    return this.serializeQuotation(quotation);
  },

  /**
   * Update quotation
   */
  async updateQuotation(businessId, quotationId, data) {
    const quote = await prisma.quotations.findFirst({
      where: { id: quotationId, business_id: businessId },
      include: { quotation_items: true },
    });

    if (!quote) {
      throw ApiError.notFound('Quotation not found');
    }

    if (quote.status === 'ACCEPTED') {
      throw ApiError.badRequest('Cannot edit an accepted quotation. Create a new quotation or duplicate instead.');
    }

    // Check if booking already created from this quote
    const existingBooking = await prisma.bookings.findFirst({
      where: { quotation_id: quotationId },
    });
    if (existingBooking) {
      throw ApiError.badRequest('Cannot edit a quotation that has already been converted into a booking');
    }

    const itemsToProcess = data.items || quote.quotation_items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      unit_price_paise: Number(i.unit_price_paise),
    }));

    const discountPaise = data.discount_paise !== undefined ? data.discount_paise : Number(quote.discount_paise);
    const taxPaise = data.tax_paise !== undefined ? data.tax_paise : Number(quote.tax_paise);

    const { calculatedItems, subtotal_paise, discount_paise: finalDiscount, tax_paise: finalTax, total_paise } =
      this.calculateQuotationTotals(itemsToProcess, discountPaise, taxPaise);

    await prisma.$transaction(async (tx) => {
      await tx.quotations.update({
        where: { id: quotationId },
        data: {
          ...(data.customer_id !== undefined ? { customer_id: data.customer_id || null } : {}),
          ...(data.valid_until !== undefined ? { valid_until: data.valid_until ? new Date(`${data.valid_until}T00:00:00.000Z`) : null } : {}),
          ...(data.terms !== undefined ? { terms: data.terms } : {}),
          subtotal_paise,
          discount_paise: finalDiscount,
          tax_paise: finalTax,
          total_paise,
        },
      });

      if (data.items) {
        // Replace quotation items
        await tx.quotation_items.deleteMany({
          where: { quotation_id: quotationId },
        });

        for (const item of calculatedItems) {
          await tx.quotation_items.create({
            data: {
              quotation_id: quotationId,
              description: item.description,
              quantity: item.quantity,
              unit_price_paise: item.unit_price_paise,
              line_total_paise: item.line_total_paise,
            },
          });
        }
      }
    });

    return this.getQuotationById(businessId, quotationId);
  },

  /**
   * Update quotation status with transition matrix validation
   */
  async updateQuotationStatus(businessId, quotationId, newStatus) {
    const quote = await prisma.quotations.findFirst({
      where: { id: quotationId, business_id: businessId },
    });

    if (!quote) {
      throw ApiError.notFound('Quotation not found');
    }

    if (quote.status === newStatus) {
      return this.serializeQuotation(quote);
    }

    const allowed = VALID_QUOTATION_TRANSITIONS[quote.status] || [];
    if (!allowed.includes(newStatus)) {
      throw ApiError.badRequest(
        `Invalid status transition from "${quote.status}" to "${newStatus}". Permitted transitions: ${allowed.join(', ') || 'None (Terminal state)'}`
      );
    }

    const updateData = {
      status: newStatus,
    };

    if (newStatus === 'SENT' && !quote.sent_at) {
      updateData.sent_at = new Date();
    } else if (newStatus === 'ACCEPTED' && !quote.accepted_at) {
      updateData.accepted_at = new Date();
    }

    const updated = await prisma.quotations.update({
      where: { id: quotationId },
      data: updateData,
      include: {
        customers: true,
        enquiries: true,
        quotation_items: true,
        bookings: true,
      },
    });

    return this.serializeQuotation(updated);
  },

  /**
   * Convert accepted quotation into a booking
   */
  async convertQuotationToBooking(businessId, userId, quotationId, bookingData) {
    // 1. Confirm quotation belongs to the authenticated user's business
    const quote = await prisma.quotations.findFirst({
      where: { id: quotationId, business_id: businessId },
      include: {
        customers: true,
        enquiries: true,
        quotation_items: true,
        bookings: true,
      },
    });

    if (!quote) {
      throw ApiError.notFound('Quotation not found in this business');
    }

    // 2. Confirm quotation is in ACCEPTED status (or auto-accept if in SENT/DRAFT)
    if (quote.status !== 'ACCEPTED') {
      // If client attempts conversion on DRAFT or SENT, validate status
      throw ApiError.badRequest(
        `Quotation must be in 'ACCEPTED' status before converting to a booking. Current status is '${quote.status}'.`
      );
    }

    // 3. Confirm quotation has not already been converted (prevent duplicate bookings)
    const existingBooking = await prisma.bookings.findFirst({
      where: {
        business_id: businessId,
        quotation_id: quotationId,
      },
    });

    if (existingBooking) {
      throw ApiError.conflict(
        `Quotation ${quote.quotation_number} has already been converted to booking ${existingBooking.booking_number}`
      );
    }

    // 4. Validate customer exists (quote must have customer_id or linked enquiry)
    let customerId = quote.customer_id;
    if (!customerId && quote.enquiry_id) {
      const enquiry = await prisma.enquiries.findUnique({
        where: { id: quote.enquiry_id },
      });
      if (enquiry && enquiry.customer_id) {
        customerId = enquiry.customer_id;
      }
    }

    if (!customerId) {
      throw ApiError.badRequest('Quotation is missing a linked customer record. Please assign a customer before conversion.');
    }

    const customer = await prisma.customers.findFirst({
      where: { id: customerId, business_id: businessId },
    });

    if (!customer) {
      throw ApiError.badRequest('Customer associated with quotation could not be found');
    }

    // 5. Validate required booking dates and event information
    if (!bookingData.event_date) {
      throw ApiError.badRequest('Required event date is missing');
    }

    const bookingNumber = `BK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    // 6. Create the booking and its related records using a database transaction
    const booking = await prisma.$transaction(async (tx) => {
      // Create confirmed booking linked to quotation
      const createdBooking = await tx.bookings.create({
        data: {
          business_id: businessId,
          customer_id: customerId,
          enquiry_id: quote.enquiry_id || null,
          quotation_id: quote.id,
          booking_number: bookingNumber,
          status: 'CONFIRMED',
          total_amount_paise: quote.total_paise,
          discount_paise: quote.discount_paise,
          notes: bookingData.notes || `Converted from quotation ${quote.quotation_number}`,
          created_by: userId,
        },
      });

      // Status history entry
      await tx.booking_status_history.create({
        data: {
          business_id: businessId,
          booking_id: createdBooking.id,
          old_status: null,
          new_status: 'CONFIRMED',
          note: `Booking created via conversion of Quotation ${quote.quotation_number}`,
          changed_by: userId,
        },
      });

      // Create primary wedding / event ceremony
      await tx.booking_events.create({
        data: {
          business_id: businessId,
          booking_id: createdBooking.id,
          event_kind: bookingData.event_kind || 'WEDDING',
          title: `${customer.full_name} - ${bookingData.event_kind || 'Wedding'}`,
          event_date: new Date(`${bookingData.event_date}T00:00:00.000Z`),
          start_time: parseTimeString(bookingData.start_time),
          end_time: parseTimeString(bookingData.end_time),
          venue: bookingData.venue || null,
          city: bookingData.city || customer.city || null,
          instructions: bookingData.instructions || null,
          status: 'SCHEDULED',
        },
      });

      // If quote is linked to an enquiry, update enquiry status to CONVERTED
      if (quote.enquiry_id) {
        await tx.enquiries.update({
          where: { id: quote.enquiry_id },
          data: { status: 'CONVERTED' },
        });

        await tx.enquiry_activities.create({
          data: {
            business_id: businessId,
            enquiry_id: quote.enquiry_id,
            activity_type: 'CONVERSION',
            title: 'Converted to Confirmed Booking',
            details: `Enquiry converted into booking ${createdBooking.booking_number} from Quotation ${quote.quotation_number}. Total: ₹${(Number(quote.total_paise) / 100).toFixed(2)}`,
            created_by: userId,
          },
        });
      }

      return createdBooking;
    });

    const fullBooking = await prisma.bookings.findUnique({
      where: { id: booking.id },
      include: {
        customers: true,
        booking_events: true,
        quotations: {
          select: {
            id: true,
            quotation_number: true,
            total_paise: true,
          },
        },
      },
    });

    return {
      message: 'Quotation successfully converted to booking',
      booking: {
        ...fullBooking,
        total_amount_paise: Number(fullBooking.total_amount_paise),
        discount_paise: Number(fullBooking.discount_paise),
        quotations: fullBooking.quotations
          ? {
              ...fullBooking.quotations,
              total_paise: Number(fullBooking.quotations.total_paise),
            }
          : null,
      },
      quotation: await this.getQuotationById(businessId, quotationId),
    };
  },

  /**
   * Delete quotation permanently if not converted to a booking
   */
  async deleteQuotation(businessId, quotationId) {
    const quote = await prisma.quotations.findFirst({
      where: { id: quotationId, business_id: businessId },
      include: {
        bookings: { select: { id: true, booking_number: true } },
      },
    });

    if (!quote) {
      throw ApiError.notFound('Quotation not found in this business');
    }

    if (quote.bookings && quote.bookings.length > 0) {
      throw ApiError.badRequest(
        `Cannot delete quotation ${quote.quotation_number} because it has already been converted into booking ${quote.bookings[0].booking_number}. Please keep it for audit records or update status to DECLINED.`
      );
    }

    // Safe to delete quotation and cascade items
    await prisma.quotations.delete({
      where: { id: quotationId },
    });

    return {
      id: quotationId,
      deleted: true,
      message: 'Quotation removed successfully',
    };
  },

  /**
   * Serializes BigInt and Decimal fields for JSON output
   */
  serializeQuotation(q) {
    if (!q) return null;
    return {
      ...q,
      subtotal_paise: Number(q.subtotal_paise),
      discount_paise: Number(q.discount_paise),
      tax_paise: Number(q.tax_paise),
      total_paise: Number(q.total_paise),
      quotation_items: (q.quotation_items || []).map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        unit_price_paise: Number(item.unit_price_paise),
        line_total_paise: Number(item.line_total_paise),
      })),
    };
  },
};
