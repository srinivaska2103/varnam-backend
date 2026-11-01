import prisma from '../config/prisma.js';
import { transporter } from '../config/mailer.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiResponse.js';

export const supportService = {
  /**
   * Generates a safe, sequential-like unique ticket number:
   * e.g. VARNAM-2026-00001
   */
  async generateTicketNumber() {
    const currentYear = new Date().getFullYear();
    const prefix = `VARNAM-${currentYear}-`;

    // Count tickets created this year
    const count = await prisma.support_tickets.count({
      where: {
        ticket_number: { startsWith: prefix },
      },
    });

    const nextSeq = String(count + 1).padStart(5, '0');
    let candidate = `${prefix}${nextSeq}`;

    // Ensure uniqueness in case of race conditions
    let exists = await prisma.support_tickets.findUnique({
      where: { ticket_number: candidate },
    });

    let attempt = 1;
    while (exists) {
      const altSeq = String(count + 1 + attempt).padStart(5, '0');
      candidate = `${prefix}${altSeq}`;
      exists = await prisma.support_tickets.findUnique({
        where: { ticket_number: candidate },
      });
      attempt++;
    }

    return candidate;
  },

  /**
   * Safe email dispatch helper that records errors without blocking ticket flows
   */
  async safeSendEmail({ to, subject, html, text }) {
    if (!to) return { success: false, reason: 'No recipient email configured' };
    try {
      const from = env.SMTP_FROM || 'VARNAM Bridal Support <noreply@vexatech.in>';
      await transporter.sendMail({
        from,
        to,
        subject,
        html,
        text,
      });
      return { success: true };
    } catch (err) {
      console.warn(`[SupportService] Email notification warning (to: ${to}):`, err.message);
      return { success: false, error: err.message };
    }
  },

  // ==========================================
  // HELP ARTICLES & CATEGORIES
  // ==========================================

  async listCategories() {
    return prisma.help_categories.findMany({
      where: { is_active: true },
      orderBy: { display_order: 'asc' },
      include: {
        _count: {
          select: { help_articles: { where: { is_published: true } } },
        },
      },
    });
  },

  async listArticles({ search, categorySlug, page = 1, limit = 50 }) {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {
      is_published: true,
      ...(categorySlug
        ? { help_categories: { slug: categorySlug } }
        : {}),
    };

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { short_description: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } },
        { keywords: { has: q.toLowerCase() } },
      ];
    }

    const [articles, total] = await Promise.all([
      prisma.help_articles.findMany({
        where,
        skip,
        take,
        orderBy: [{ display_order: 'asc' }, { created_at: 'desc' }],
        include: {
          help_categories: {
            select: { id: true, name: true, slug: true, icon: true },
          },
        },
      }),
      prisma.help_articles.count({ where }),
    ]);

    return {
      articles,
      pagination: {
        page: Number(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take) || 1,
      },
    };
  },

  async getArticleBySlug(slug) {
    const article = await prisma.help_articles.findUnique({
      where: { slug },
      include: {
        help_categories: {
          select: { id: true, name: true, slug: true, icon: true },
        },
      },
    });

    if (!article || !article.is_published) {
      throw ApiError.notFound('Help article not found');
    }

    // Increment view count asynchronously
    prisma.help_articles.update({
      where: { id: article.id },
      data: { view_count: { increment: 1 } },
    }).catch(() => {});

    // Fetch related articles in the same category
    const related = await prisma.help_articles.findMany({
      where: {
        category_id: article.category_id,
        is_published: true,
        id: { not: article.id },
      },
      take: 4,
      orderBy: { helpful_count: 'desc' },
      select: {
        id: true,
        title: true,
        slug: true,
        short_description: true,
      },
    });

    return {
      ...article,
      related_articles: related,
    };
  },

  async recordArticleFeedback(articleId, userId, businessId, { is_helpful, comment }) {
    const article = await prisma.help_articles.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      throw ApiError.notFound('Help article not found');
    }

    // Create feedback record
    await prisma.help_article_feedbacks.create({
      data: {
        article_id: articleId,
        user_id: userId || null,
        business_id: businessId || null,
        is_helpful: Boolean(is_helpful),
        comment: comment?.trim() || null,
      },
    });

    // Update counts on the article
    const updated = await prisma.help_articles.update({
      where: { id: articleId },
      data: {
        helpful_count: is_helpful ? { increment: 1 } : undefined,
        not_helpful_count: !is_helpful ? { increment: 1 } : undefined,
      },
    });

    return {
      success: true,
      helpful_count: updated.helpful_count,
      not_helpful_count: updated.not_helpful_count,
    };
  },

  // ==========================================
  // SUPPORT TICKETS (USER FACING)
  // ==========================================

  async createTicket(businessId, userId, data) {
    const {
      subject,
      category,
      priority = 'MEDIUM',
      related_module,
      description,
      attachments = [],
    } = data;

    if (!subject?.trim() || !category?.trim() || !description?.trim()) {
      throw ApiError.badRequest('Subject, Category, and Description are required');
    }

    const business = await prisma.businesses.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, business_phone: true, business_email: true },
    });

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true },
    });

    const ticketNumber = await this.generateTicketNumber();

    // Create Ticket and initial message in transaction
    const ticket = await prisma.$transaction(async (tx) => {
      const newTicket = await tx.support_tickets.create({
        data: {
          ticket_number: ticketNumber,
          business_id: businessId,
          user_id: userId,
          subject: subject.trim(),
          category: category.trim(),
          priority,
          status: 'OPEN',
          related_module: related_module?.trim() || null,
          description: description.trim(),
        },
      });

      // Initial ticket message
      const msg = await tx.support_ticket_messages.create({
        data: {
          ticket_id: newTicket.id,
          sender_type: 'USER',
          sender_user_id: userId,
          message: description.trim(),
          is_internal_note: false,
        },
      });

      // Attachments if provided
      if (Array.isArray(attachments) && attachments.length > 0) {
        for (const att of attachments) {
          if (att.file_url && att.file_name) {
            await tx.support_ticket_attachments.create({
              data: {
                ticket_id: newTicket.id,
                message_id: msg.id,
                file_name: att.file_name,
                file_url: att.file_url,
                file_size: att.file_size || null,
                mime_type: att.mime_type || null,
              },
            });
          }
        }
      }

      // Activity log
      await tx.support_ticket_activities.create({
        data: {
          ticket_id: newTicket.id,
          actor_user_id: userId,
          activity_type: 'TICKET_CREATED',
          details: {
            ticket_number: ticketNumber,
            priority,
            category,
          },
        },
      });

      return newTicket;
    });

    // Send admin email notification in background
    const adminEmail = process.env.SUPPORT_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL || 'vexatech.connect@gmail.com';
    const emailSubject = `[VARNAM SUPPORT] New Ticket #${ticket.ticket_number} - ${ticket.subject}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1c1917; border: 1px solid #fed7aa; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #ea580c 0%, #f97316 100%); padding: 24px; color: #ffffff; text-align: center;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 1px;">VARNAM SUPPORT ALERT</h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #ffedd5;">New Studio Support Ticket Created</p>
        </div>
        <div style="padding: 24px; background: #ffffff;">
          <p style="font-size: 14px; margin-top: 0;">A new support ticket has been submitted through VARNAM.</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0;">
            <tr><td style="padding: 6px 0; font-weight: bold; color: #9a3412; width: 140px;">Ticket Number:</td><td><strong>${ticket.ticket_number}</strong></td></tr>
            <tr><td style="padding: 6px 0; font-weight: bold; color: #9a3412;">Studio Name:</td><td>${business?.name || 'Studio'}</td></tr>
            <tr><td style="padding: 6px 0; font-weight: bold; color: #9a3412;">Submitted By:</td><td>${user?.name || 'User'}</td></tr>
            <tr><td style="padding: 6px 0; font-weight: bold; color: #9a3412;">Email:</td><td>${user?.email || 'N/A'}</td></tr>
            <tr><td style="padding: 6px 0; font-weight: bold; color: #9a3412;">Phone:</td><td>${user?.phone || business?.business_phone || 'N/A'}</td></tr>
            <tr><td style="padding: 6px 0; font-weight: bold; color: #9a3412;">Category:</td><td>${ticket.category}</td></tr>
            <tr><td style="padding: 6px 0; font-weight: bold; color: #9a3412;">Priority:</td><td><span style="font-weight: bold; color: ${ticket.priority === 'CRITICAL' ? '#b91c1c' : '#ea580c'};">${ticket.priority}</span></td></tr>
            <tr><td style="padding: 6px 0; font-weight: bold; color: #9a3412;">Related Module:</td><td>${ticket.related_module || 'General'}</td></tr>
            <tr><td style="padding: 6px 0; font-weight: bold; color: #9a3412;">Submitted At:</td><td>${new Date().toLocaleString()}</td></tr>
          </table>
          <div style="background: #fffaf5; border: 1px solid #fed7aa; border-radius: 8px; padding: 14px; margin: 16px 0;">
            <div style="font-weight: bold; font-size: 12px; color: #9a3412; margin-bottom: 6px; text-transform: uppercase;">Issue Description</div>
            <div style="font-size: 13px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${ticket.description}</div>
          </div>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Please log in to the VARNAM Admin Dashboard (/admin/support) to review and respond.</p>
        </div>
      </div>
    `;

    this.safeSendEmail({
      to: adminEmail,
      subject: emailSubject,
      html: emailHtml,
      text: `New Ticket #${ticket.ticket_number}\nStudio: ${business?.name}\nCategory: ${ticket.category}\nPriority: ${ticket.priority}\n\n${ticket.description}`,
    });

    return ticket;
  },

  async listUserTickets(businessId, { status, priority, search, page = 1, limit = 20 }) {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {
      business_id: businessId,
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
    };

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { ticket_number: { contains: q, mode: 'insensitive' } },
        { subject: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.support_tickets.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: {
          users_support_tickets_user_idTousers: { select: { id: true, name: true, email: true } },
          support_ticket_messages: {
            where: { is_internal_note: false },
            orderBy: { created_at: 'desc' },
            take: 1,
            select: { id: true, message: true, sender_type: true, created_at: true },
          },
        },
      }),
      prisma.support_tickets.count({ where }),
    ]);

    const formattedTickets = tickets.map((t) => ({
      ...t,
      users: t.users_support_tickets_user_idTousers,
    }));

    return {
      tickets: formattedTickets,
      pagination: {
        page: Number(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take) || 1,
      },
    };
  },

  async getUserTicketById(businessId, ticketId) {
    const ticket = await prisma.support_tickets.findFirst({
      where: { id: ticketId, business_id: businessId },
      include: {
        businesses: { select: { id: true, name: true, slug: true } },
        users_support_tickets_user_idTousers: { select: { id: true, name: true, email: true, phone: true } },
        support_ticket_messages: {
          where: { is_internal_note: false }, // Exclude internal notes from client view
          orderBy: { created_at: 'asc' },
          include: {
            users: { select: { id: true, name: true, email: true } },
            support_ticket_attachments: true,
          },
        },
        support_ticket_attachments: true,
        support_ticket_activities: {
          orderBy: { created_at: 'asc' },
          include: {
            users: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!ticket) {
      throw ApiError.notFound('Support ticket not found');
    }

    return {
      ...ticket,
      users: ticket.users_support_tickets_user_idTousers,
    };
  },

  async addUserReply(businessId, userId, ticketId, { message, attachments = [] }) {
    if (!message?.trim()) {
      throw ApiError.badRequest('Reply message cannot be empty');
    }

    const ticket = await prisma.support_tickets.findFirst({
      where: { id: ticketId, business_id: businessId },
      include: {
        businesses: { select: { name: true } },
        users_support_tickets_user_idTousers: { select: { name: true, email: true } },
      },
    });

    if (!ticket) {
      throw ApiError.notFound('Support ticket not found');
    }

    if (ticket.status === 'CLOSED') {
      throw ApiError.badRequest('This ticket is closed and cannot receive new replies.');
    }

    const reply = await prisma.$transaction(async (tx) => {
      const msg = await tx.support_ticket_messages.create({
        data: {
          ticket_id: ticketId,
          sender_type: 'USER',
          sender_user_id: userId,
          message: message.trim(),
          is_internal_note: false,
        },
      });

      if (Array.isArray(attachments) && attachments.length > 0) {
        for (const att of attachments) {
          if (att.file_url && att.file_name) {
            await tx.support_ticket_attachments.create({
              data: {
                ticket_id: ticketId,
                message_id: msg.id,
                file_name: att.file_name,
                file_url: att.file_url,
                file_size: att.file_size || null,
                mime_type: att.mime_type || null,
              },
            });
          }
        }
      }

      // If ticket was waiting for user or resolved, reopen to IN_PROGRESS
      const newStatus = ticket.status === 'RESOLVED' || ticket.status === 'WAITING_FOR_USER'
        ? 'IN_PROGRESS'
        : ticket.status;

      await tx.support_tickets.update({
        where: { id: ticketId },
        data: {
          status: newStatus,
          updated_at: new Date(),
        },
      });

      await tx.support_ticket_activities.create({
        data: {
          ticket_id: ticketId,
          actor_user_id: userId,
          activity_type: 'USER_REPLY',
          details: { message_preview: message.substring(0, 100) },
        },
      });

      return msg;
    });

    // Notify admin
    const adminEmail = process.env.SUPPORT_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL || 'vexatech.connect@gmail.com';
    this.safeSendEmail({
      to: adminEmail,
      subject: `[VARNAM SUPPORT] New Reply on #${ticket.ticket_number} - ${ticket.subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #fed7aa; border-radius: 8px;">
          <h3 style="color: #ea580c; margin-top: 0;">Studio Client Replied to Ticket #${ticket.ticket_number}</h3>
          <p><strong>Studio:</strong> ${ticket.businesses?.name}</p>
          <p><strong>Subject:</strong> ${ticket.subject}</p>
          <div style="background: #fffaf5; padding: 12px; border-radius: 6px; border-left: 4px solid #f97316;">
            ${message}
          </div>
          <p style="font-size: 12px; color: #64748b;">Log in to the Admin Dashboard to reply.</p>
        </div>
      `,
      text: `User replied to ticket #${ticket.ticket_number}:\n\n${message}`,
    });

    return reply;
  },

  // ==========================================
  // ADMIN SUPPORT MANAGEMENT (SUPER ADMIN)
  // ==========================================

  async getAdminAnalytics() {
    const [
      total,
      open,
      inProgress,
      waitingForUser,
      resolved,
      closed,
      critical,
      high,
    ] = await Promise.all([
      prisma.support_tickets.count(),
      prisma.support_tickets.count({ where: { status: 'OPEN' } }),
      prisma.support_tickets.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.support_tickets.count({ where: { status: 'WAITING_FOR_USER' } }),
      prisma.support_tickets.count({ where: { status: 'RESOLVED' } }),
      prisma.support_tickets.count({ where: { status: 'CLOSED' } }),
      prisma.support_tickets.count({ where: { priority: 'CRITICAL', status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
      prisma.support_tickets.count({ where: { priority: 'HIGH', status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
    ]);

    return {
      total,
      open,
      inProgress,
      waitingForUser,
      resolved,
      closed,
      criticalHighPending: critical + high,
    };
  },

  async listAdminTickets({ status, priority, category, search, page = 1, limit = 20 }) {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(category ? { category } : {}),
    };

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { ticket_number: { contains: q, mode: 'insensitive' } },
        { subject: { contains: q, mode: 'insensitive' } },
        { businesses: { name: { contains: q, mode: 'insensitive' } } },
        { users_support_tickets_user_idTousers: { email: { contains: q, mode: 'insensitive' } } },
        { users_support_tickets_user_idTousers: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.support_tickets.findMany({
        where,
        skip,
        take,
        orderBy: [{ created_at: 'desc' }],
        include: {
          businesses: { select: { id: true, name: true, slug: true, city: true } },
          users_support_tickets_user_idTousers: { select: { id: true, name: true, email: true, phone: true } },
          users_support_tickets_assigned_admin_idTousers: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.support_tickets.count({ where }),
    ]);

    const formattedTickets = tickets.map((t) => ({
      ...t,
      users: t.users_support_tickets_user_idTousers,
      assigned_admin: t.users_support_tickets_assigned_admin_idTousers,
    }));

    return {
      tickets: formattedTickets,
      pagination: {
        page: Number(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take) || 1,
      },
    };
  },

  async getAdminTicketById(ticketId) {
    const ticket = await prisma.support_tickets.findUnique({
      where: { id: ticketId },
      include: {
        businesses: { select: { id: true, name: true, slug: true, city: true, business_email: true, business_phone: true } },
        users_support_tickets_user_idTousers: { select: { id: true, name: true, email: true, phone: true } },
        users_support_tickets_assigned_admin_idTousers: { select: { id: true, name: true, email: true } },
        support_ticket_messages: {
          orderBy: { created_at: 'asc' },
          include: {
            users: { select: { id: true, name: true, email: true, is_super_admin: true } },
            support_ticket_attachments: true,
          },
        },
        support_ticket_attachments: true,
        support_ticket_activities: {
          orderBy: { created_at: 'asc' },
          include: {
            users: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!ticket) {
      throw ApiError.notFound('Support ticket not found');
    }

    return {
      ...ticket,
      users: ticket.users_support_tickets_user_idTousers,
      assigned_admin: ticket.users_support_tickets_assigned_admin_idTousers,
    };
  },

  async updateAdminTicket(ticketId, adminUserId, data) {
    const existing = await prisma.support_tickets.findUnique({
      where: { id: ticketId },
      include: {
        businesses: { select: { name: true, business_email: true } },
        users_support_tickets_user_idTousers: { select: { name: true, email: true } },
      },
    });

    if (!existing) {
      throw ApiError.notFound('Support ticket not found');
    }

    const existingUser = existing.users_support_tickets_user_idTousers;

    const updateData = {};
    const activities = [];

    if (data.status && data.status !== existing.status) {
      updateData.status = data.status;
      if (data.status === 'RESOLVED') {
        updateData.resolved_at = new Date();
      } else if (data.status === 'CLOSED') {
        updateData.closed_at = new Date();
      }
      activities.push({
        activity_type: 'STATUS_CHANGED',
        details: { from: existing.status, to: data.status },
      });
    }

    if (data.priority && data.priority !== existing.priority) {
      updateData.priority = data.priority;
      activities.push({
        activity_type: 'PRIORITY_CHANGED',
        details: { from: existing.priority, to: data.priority },
      });
    }

    if (data.assigned_admin_id !== undefined && data.assigned_admin_id !== existing.assigned_admin_id) {
      updateData.assigned_admin_id = data.assigned_admin_id || null;
      activities.push({
        activity_type: 'ADMIN_ASSIGNED',
        details: { assigned_to: data.assigned_admin_id },
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.support_tickets.update({
        where: { id: ticketId },
        data: {
          ...updateData,
          updated_at: new Date(),
        },
      });

      for (const act of activities) {
        await tx.support_ticket_activities.create({
          data: {
            ticket_id: ticketId,
            actor_user_id: adminUserId,
            activity_type: act.activity_type,
            details: act.details,
          },
        });
      }

      return res;
    });

    // Notify user if status changed to RESOLVED or other major state
    if (data.status && data.status !== existing.status && existingUser?.email) {
      const isResolved = data.status === 'RESOLVED';
      this.safeSendEmail({
        to: existingUser.email,
        subject: `[VARNAM SUPPORT] Ticket #${existing.ticket_number} Status Updated: ${data.status}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 24px; border: 1px solid #fed7aa; border-radius: 12px;">
            <h3 style="color: #ea580c; margin-top: 0;">Support Ticket Status Updated</h3>
            <p>Hello ${existingUser.name || 'Valued Partner'},</p>
            <p>Your support ticket <strong>#${existing.ticket_number}</strong> (${existing.subject}) has been marked as <strong>${data.status}</strong>.</p>
            ${isResolved ? '<p style="color: #15803d; font-weight: bold;">If your issue has been completely addressed, no further action is needed. If you need further help, you can reply directly to the ticket in your Help & Support portal.</p>' : ''}
            <p style="font-size: 12px; color: #64748b; margin-top: 20px;">Thank you for using VARNAM Bridal Management System.</p>
          </div>
        `,
        text: `Your ticket #${existing.ticket_number} status is now ${data.status}.`,
      });
    }

    return updated;
  },

  async addAdminReply(ticketId, adminUserId, { message, is_internal_note = false, attachments = [] }) {
    if (!message?.trim()) {
      throw ApiError.badRequest('Message cannot be empty');
    }

    const ticket = await prisma.support_tickets.findUnique({
      where: { id: ticketId },
      include: {
        businesses: { select: { name: true } },
        users_support_tickets_user_idTousers: { select: { name: true, email: true } },
      },
    });

    if (!ticket) {
      throw ApiError.notFound('Support ticket not found');
    }

    const recipientUser = ticket.users_support_tickets_user_idTousers;

    const reply = await prisma.$transaction(async (tx) => {
      const msg = await tx.support_ticket_messages.create({
        data: {
          ticket_id: ticketId,
          sender_type: 'ADMIN',
          sender_user_id: adminUserId,
          message: message.trim(),
          is_internal_note: Boolean(is_internal_note),
        },
      });

      if (Array.isArray(attachments) && attachments.length > 0) {
        for (const att of attachments) {
          if (att.file_url && att.file_name) {
            await tx.support_ticket_attachments.create({
              data: {
                ticket_id: ticketId,
                message_id: msg.id,
                file_name: att.file_name,
                file_url: att.file_url,
                file_size: att.file_size || null,
                mime_type: att.mime_type || null,
              },
            });
          }
        }
      }

      // If it's a public reply to the user, update status to WAITING_FOR_USER if currently IN_PROGRESS/OPEN
      if (!is_internal_note) {
        const nextStatus = ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS'
          ? 'WAITING_FOR_USER'
          : ticket.status;

        await tx.support_tickets.update({
          where: { id: ticketId },
          data: {
            status: nextStatus,
            updated_at: new Date(),
          },
        });
      }

      await tx.support_ticket_activities.create({
        data: {
          ticket_id: ticketId,
          actor_user_id: adminUserId,
          activity_type: is_internal_note ? 'INTERNAL_NOTE_ADDED' : 'ADMIN_REPLY',
          details: { message_preview: message.substring(0, 100) },
        },
      });

      return msg;
    });

    // Notify user by email ONLY if this is NOT an internal note
    if (!is_internal_note && recipientUser?.email) {
      this.safeSendEmail({
        to: recipientUser.email,
        subject: `[VARNAM SUPPORT] Response on Ticket #${ticket.ticket_number} - ${ticket.subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 24px; border: 1px solid #fed7aa; border-radius: 12px;">
            <div style="background: #ea580c; padding: 12px 18px; border-radius: 8px; color: #ffffff; font-weight: bold; font-size: 14px;">
              VARNAM Bridal Support Team Replied
            </div>
            <p style="margin-top: 16px;">Hello ${recipientUser.name || 'Partner'},</p>
            <p>Our team has replied to your support ticket <strong>#${ticket.ticket_number}</strong> (${ticket.subject}):</p>
            <div style="background: #fffaf5; padding: 16px; border-radius: 8px; border: 1px solid #fed7aa; margin: 16px 0; font-size: 13px; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">
              ${message}
            </div>
            <p style="font-size: 13px;">You can view the full conversation and reply anytime in your studio dashboard under <strong>Help & Support</strong>.</p>
            <p style="font-size: 11px; color: #94a3b8; margin-top: 24px;">VARNAM Support &bull; Automated notification</p>
          </div>
        `,
        text: `VARNAM Bridal Support replied to #${ticket.ticket_number}:\n\n${message}`,
      });
    }

    return reply;
  },

  // Admin Article Management
  async createAdminArticle(adminUserId, data) {
    const {
      category_id,
      title,
      slug,
      short_description,
      content,
      keywords = [],
      display_order = 0,
      is_published = true,
    } = data;

    if (!category_id || !title?.trim() || !short_description?.trim() || !content?.trim()) {
      throw ApiError.badRequest('Category, title, short description, and content are required');
    }

    const finalSlug = (slug || title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    return prisma.help_articles.create({
      data: {
        category_id,
        title: title.trim(),
        slug: finalSlug,
        short_description: short_description.trim(),
        content: content.trim(),
        keywords: Array.isArray(keywords) ? keywords : [],
        display_order: Number(display_order) || 0,
        is_published: Boolean(is_published),
        created_by_user_id: adminUserId,
      },
    });
  },

  async updateAdminArticle(articleId, data) {
    const existing = await prisma.help_articles.findUnique({
      where: { id: articleId },
    });

    if (!existing) {
      throw ApiError.notFound('Help article not found');
    }

    return prisma.help_articles.update({
      where: { id: articleId },
      data: {
        ...(data.category_id ? { category_id: data.category_id } : {}),
        ...(data.title ? { title: data.title.trim() } : {}),
        ...(data.short_description ? { short_description: data.short_description.trim() } : {}),
        ...(data.content ? { content: data.content.trim() } : {}),
        ...(data.keywords ? { keywords: Array.isArray(data.keywords) ? data.keywords : [] } : {}),
        ...(data.display_order !== undefined ? { display_order: Number(data.display_order) } : {}),
        ...(data.is_published !== undefined ? { is_published: Boolean(data.is_published) } : {}),
        updated_at: new Date(),
      },
    });
  },

  async deleteAdminArticle(articleId) {
    return prisma.help_articles.delete({
      where: { id: articleId },
    });
  },
};

