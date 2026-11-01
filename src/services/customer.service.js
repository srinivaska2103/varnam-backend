import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

const ARCHIVED_TAG = '[ARCHIVED]';

export const customerService = {
  /**
   * Create a new customer record under an authorized business
   */
  async createCustomer(businessId, userId, customerData) {
    const fullName = customerData.full_name || customerData.name;
    if (!fullName) {
      throw ApiError.badRequest('Customer name (full_name) is required');
    }

    const phone = customerData.phone;
    if (!phone) {
      throw ApiError.badRequest('Customer phone number is required');
    }

    // Check if customer with same phone already exists in this business
    const existing = await prisma.customers.findUnique({
      where: {
        business_id_phone: {
          business_id: businessId,
          phone: phone,
        },
      },
    });

    if (existing) {
      throw ApiError.conflict('A customer with this phone number already exists in your business');
    }

    const customer = await prisma.customers.create({
      data: {
        business_id: businessId,
        full_name: fullName,
        phone: phone,
        email: customerData.email || null,
        alternate_phone: customerData.alternate_phone || null,
        address: customerData.address || null,
        city: customerData.city || null,
        notes: customerData.notes || null,
        created_by: userId,
      },
    });

    return {
      ...customer,
      is_archived: customer.notes?.includes(ARCHIVED_TAG) || false,
    };
  },

  /**
   * List customers scoped to authorized business with pagination, search & filters
   */
  async listCustomers(businessId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = {
      business_id: businessId,
    };

    const andConditions = [];

    // Exclude archived by default unless explicitly requested
    // In SQL / PostgreSQL NULL NOT LIKE '%[ARCHIVED]%' evaluates to UNKNOWN (falsy)
    // So we must explicitly match notes == null OR notes NOT containing ARCHIVED_TAG
    if (!query.includeArchived) {
      andConditions.push({
        OR: [
          { notes: null },
          { NOT: { notes: { contains: ARCHIVED_TAG } } },
        ],
      });
    }

    // Search by name, phone, or email
    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      andConditions.push({
        OR: [
          { full_name: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      });
    }

    if (query.city && query.city.trim()) {
      where.city = { contains: query.city.trim(), mode: 'insensitive' };
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const sortBy = query.sortBy || 'created_at';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [total, customers] = await prisma.$transaction([
      prisma.customers.count({ where }),
      prisma.customers.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        select: {
          id: true,
          business_id: true,
          full_name: true,
          phone: true,
          email: true,
          alternate_phone: true,
          address: true,
          city: true,
          notes: true,
          created_at: true,
          updated_at: true,
          bookings: {
            take: 1,
            orderBy: { created_at: 'desc' },
            select: {
              id: true,
              booking_number: true,
              status: true,
              booking_events: {
                take: 1,
                orderBy: { event_date: 'asc' },
                select: {
                  event_date: true,
                  event_kind: true,
                  venue: true,
                },
              },
            },
          },
          _count: {
            select: {
              bookings: true,
              enquiries: true,
            },
          },
        },
      }),
    ]);

    const formatted = customers.map((c) => {
      const upcomingEvent = c.bookings?.[0]?.booking_events?.[0] || null;
      return {
        ...c,
        is_archived: c.notes?.includes(ARCHIVED_TAG) || false,
        bookings_count: c._count.bookings,
        enquiries_count: c._count.enquiries,
        upcoming_event_date: upcomingEvent?.event_date || null,
        upcoming_event_kind: upcomingEvent?.event_kind || null,
        _count: undefined,
        bookings: undefined,
      };
    });

    return {
      customers: formatted,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get single customer by ID, enforcing business scoping with enquiries and bookings history
   */
  async getCustomerById(businessId, customerId) {
    const customer = await prisma.customers.findFirst({
      where: {
        id: customerId,
        business_id: businessId,
      },
      include: {
        enquiries: {
          orderBy: { created_at: 'desc' },
          take: 10,
          select: {
            id: true,
            customer_name: true,
            event_kind: true,
            event_date: true,
            status: true,
            budget_paise: true,
            created_at: true,
          },
        },
        bookings: {
          orderBy: { created_at: 'desc' },
          take: 10,
          select: {
            id: true,
            booking_number: true,
            status: true,
            total_amount_paise: true,
            package_name_snapshot: true,
            notes: true,
            created_at: true,
            booking_events: {
              select: {
                id: true,
                event_kind: true,
                title: true,
                event_date: true,
                venue: true,
                city: true,
              },
            },
          },
        },
        payment_records: {
          orderBy: { created_at: 'desc' },
          take: 10,
          select: {
            id: true,
            amount_paise: true,
            method: true,
            status: true,
            receipt_number: true,
            created_at: true,
          },
        },
        customer_preferences: true,
      },
    });

    if (!customer) {
      throw ApiError.notFound('Customer not found in this business');
    }

    // Convert BigInts safely
    const formattedEnquiries = customer.enquiries.map((e) => ({
      ...e,
      budget_paise: e.budget_paise ? Number(e.budget_paise) : null,
    }));

    const formattedBookings = customer.bookings.map((b) => ({
      ...b,
      total_amount_paise: b.total_amount_paise ? Number(b.total_amount_paise) : 0,
    }));

    const formattedPayments = (customer.payment_records || []).map((p) => ({
      ...p,
      amount_paise: p.amount_paise ? Number(p.amount_paise) : 0,
      payment_method: p.method,
    }));

    return {
      ...customer,
      is_archived: customer.notes?.includes(ARCHIVED_TAG) || false,
      enquiries: formattedEnquiries,
      bookings: formattedBookings,
      payment_records: formattedPayments,
    };
  },

  /**
   * Update permitted customer fields
   */
  /**
   * Update permitted customer fields and synchronize active references
   */
  async updateCustomer(businessId, customerId, updateData) {
    // 1. Verify customer exists and belongs to this business (tenant isolation)
    const existing = await prisma.customers.findFirst({
      where: {
        id: customerId,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw ApiError.notFound('Customer not found in this business');
    }

    const fullName = updateData.full_name || updateData.name || existing.full_name;
    const phone = updateData.phone ? updateData.phone.trim() : existing.phone;
    const email = updateData.email !== undefined ? (updateData.email?.trim() || null) : existing.email;
    const alternatePhone = updateData.alternate_phone !== undefined ? (updateData.alternate_phone?.trim() || null) : existing.alternate_phone;
    const address = updateData.address !== undefined ? (updateData.address?.trim() || null) : existing.address;
    const city = updateData.city !== undefined ? (updateData.city?.trim() || null) : existing.city;
    const notes = updateData.notes !== undefined ? (updateData.notes?.trim() || null) : existing.notes;

    // 2. Check phone uniqueness within this studio if phone is changing
    if (phone && phone !== existing.phone) {
      const duplicatePhone = await prisma.customers.findUnique({
        where: {
          business_id_phone: {
            business_id: businessId,
            phone: phone,
          },
        },
      });

      if (duplicatePhone && duplicatePhone.id !== customerId) {
        throw ApiError.conflict('Another customer with this mobile number already exists in your studio');
      }
    }

    // 3. Atomically update customer and synchronize active references in a Prisma transaction
    const updated = await prisma.$transaction(async (tx) => {
      // A. Update authoritative customer record
      const updatedCustomer = await tx.customers.update({
        where: { id: customerId },
        data: {
          full_name: fullName,
          phone: phone,
          email: email,
          alternate_phone: alternatePhone,
          address: address,
          city: city,
          notes: notes,
          updated_at: new Date(),
        },
      });

      // B. Synchronize active/open enquiries linked to this customer
      await tx.enquiries.updateMany({
        where: {
          customer_id: customerId,
          business_id: businessId,
          status: { in: ['NEW', 'CONTACTED', 'CONSULTATION', 'QUOTATION_SENT', 'FOLLOW_UP'] },
        },
        data: {
          customer_name: fullName,
          customer_phone: phone,
          customer_email: email,
          updated_at: new Date(),
        },
      });

      // C. Synchronize upcoming/active consultations linked to this customer
      await tx.consultations.updateMany({
        where: {
          customer_id: customerId,
          business_id: businessId,
          status: { in: ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'] },
        },
        data: {
          requested_name: fullName,
          requested_phone: phone,
          updated_at: new Date(),
        },
      });

      // D. Synchronize queued notification jobs for future scheduled communications
      // If phone changed, update WHATSAPP queued jobs; if email changed, update EMAIL queued jobs
      if (phone !== existing.phone) {
        await tx.notification_jobs.updateMany({
          where: {
            customer_id: customerId,
            business_id: businessId,
            status: 'QUEUED',
            channel: 'WHATSAPP',
          },
          data: {
            recipient: phone,
          },
        });
      }

      if (email !== existing.email && email) {
        await tx.notification_jobs.updateMany({
          where: {
            customer_id: customerId,
            business_id: businessId,
            status: 'QUEUED',
            channel: 'EMAIL',
          },
          data: {
            recipient: email,
          },
        });
      }

      return updatedCustomer;
    });

    return {
      ...updated,
      is_archived: updated.notes?.includes(ARCHIVED_TAG) || false,
    };
  },

  /**
   * Soft-archive a customer without deleting historical bookings or financials
   */
  async archiveCustomer(businessId, customerId) {
    const existing = await prisma.customers.findFirst({
      where: {
        id: customerId,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw ApiError.notFound('Customer not found in this business');
    }

    if (existing.notes?.includes(ARCHIVED_TAG)) {
      return {
        ...existing,
        is_archived: true,
      };
    }

    const currentNotes = existing.notes || '';
    const updatedNotes = currentNotes ? `${ARCHIVED_TAG} ${currentNotes}` : ARCHIVED_TAG;

    const updated = await prisma.customers.update({
      where: { id: customerId },
      data: {
        notes: updatedNotes,
        updated_at: new Date(),
      },
    });

    return {
      ...updated,
      is_archived: true,
    };
  },

  /**
   * Delete customer if safe (no linked bookings or payment records)
   */
  async deleteCustomer(businessId, customerId) {
    const existing = await prisma.customers.findFirst({
      where: {
        id: customerId,
        business_id: businessId,
      },
      include: {
        _count: {
          select: {
            bookings: true,
            payment_records: true,
            enquiries: true,
          },
        },
      },
    });

    if (!existing) {
      throw ApiError.notFound('Customer not found in this business');
    }

    if (existing._count.bookings > 0 || existing._count.payment_records > 0) {
      throw ApiError.badRequest(
        `Cannot permanently delete this client because they have ${existing._count.bookings} booking(s) and ${existing._count.payment_records} payment record(s). Please archive the client instead to preserve booking & financial history.`
      );
    }

    // Safely unbind or cascade delete preferences / enquiries if needed
    await prisma.$transaction([
      prisma.customer_preferences.deleteMany({
        where: { customer_id: customerId, business_id: businessId },
      }),
      prisma.enquiries.updateMany({
        where: { customer_id: customerId, business_id: businessId },
        data: { customer_id: null },
      }),
      prisma.customers.delete({
        where: { id: customerId },
      }),
    ]);

    return {
      success: true,
      id: customerId,
      message: 'Customer deleted successfully',
    };
  },
};
