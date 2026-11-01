import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { notificationService } from './notification.service.js';
import { emailTemplates } from '../utils/emailTemplates.js';
import { APP_CONFIG } from '../config/appConfig.js';
import { env } from '../config/env.js';

export const paymentService = {
  /**
   * Record a manual payment against an authorized booking
   */
  async recordPayment(businessId, userId, data) {
    // 1. Verify booking exists and belongs to this business
    const booking = await prisma.bookings.findFirst({
      where: {
        id: data.booking_id,
        business_id: businessId,
      },
      include: {
        customers: true,
        payment_records: true,
      },
    });

    if (!booking) {
      throw ApiError.badRequest('Referenced booking does not exist in this business');
    }

    if (booking.status === 'CANCELLED') {
      throw ApiError.badRequest('Cannot record payment for a cancelled booking');
    }

    const amountPaise = BigInt(data.amount_paise);
    if (amountPaise <= BigInt(0)) {
      throw ApiError.badRequest('Payment amount must be greater than zero');
    }

    // Determine receipt number
    const receiptNumber = data.receipt_number || `REC-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    // Verify receipt number uniqueness in this business
    const existingReceipt = await prisma.payment_records.findUnique({
      where: {
        business_id_receipt_number: {
          business_id: businessId,
          receipt_number: receiptNumber,
        },
      },
    });

    if (existingReceipt) {
      throw ApiError.conflict('A payment with this receipt number already exists in your business');
    }

    const paidAt = data.paid_at ? new Date(data.paid_at) : new Date();

    const payment = await prisma.payment_records.create({
      data: {
        business_id: businessId,
        booking_id: booking.id,
        customer_id: booking.customer_id,
        amount_paise: amountPaise,
        method: data.method || 'OTHER',
        status: data.status || 'RECORDED',
        paid_at: paidAt,
        reference_note: data.reference_note || null,
        receipt_number: receiptNumber,
        notes: data.notes || null,
        recorded_by: userId,
      },
      include: {
        bookings: {
          select: {
            id: true,
            booking_number: true,
            status: true,
          },
        },
        customers: {
          select: {
            id: true,
            full_name: true,
            phone: true,
          },
        },
        users: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Trigger payment notifications for customer and studio admin
    try {
      const biz = await prisma.businesses.findUnique({
        where: { id: businessId },
        select: { name: true, business_email: true, business_phone: true, whatsapp_phone: true },
      });

      // Recalculate financial balance using all RECORDED payment records
      const allPayments = await prisma.payment_records.findMany({
        where: { booking_id: booking.id, status: 'RECORDED' },
        select: { amount_paise: true },
      });
      const totalPaidPaise = allPayments.reduce((acc, p) => acc + Number(p.amount_paise), 0);
      const netPayablePaise = Math.max(0, Number(booking.total_amount_paise) - Number(booking.discount_paise));
      const balanceRemainingPaise = Math.max(0, netPayablePaise - totalPaidPaise);

      const amountFormatted = `₹${(Number(payment.amount_paise) / 100).toFixed(2)}`;
      const totalBookingFormatted = (netPayablePaise / 100).toFixed(2);
      const balanceFormatted = (balanceRemainingPaise / 100).toFixed(2);
      const paymentDateFormatted = payment.paid_at ? new Date(payment.paid_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

      // 1. Notify Customer with payment receipt if email exists
      const clientEmail = booking.customers?.email;
      if (clientEmail) {
        const custEmailTpl = emailTemplates.paymentReceiptCustomer({
          clientName: booking.customers.full_name,
          receiptNumber: payment.receipt_number,
          amountFormatted,
          method: payment.method,
          transactionReference: payment.reference_note,
          paymentDate: paymentDateFormatted,
          bookingNumber: booking.booking_number,
          totalBookingAmount: totalBookingFormatted,
          balanceRemaining: balanceFormatted,
          businessName: biz?.name || 'Bridal Studio',
          studioPhone: biz?.phone,
          studioEmail: biz?.business_email,
        });

        await notificationService.queueNotification({
          businessId,
          recipient: clientEmail,
          channel: 'EMAIL',
          subject: custEmailTpl.subject,
          messageBody: custEmailTpl.html,
          bookingId: booking.id,
          customerId: booking.customer_id,
          idempotencyKey: `pay_rcpt_cust_${payment.id}`,
        }).then((job) => job && notificationService.processJob(job.id));
      }

      // 2. Notify Studio Admin that payment was recorded
      if (biz?.business_email) {
        const adminEmailTpl = emailTemplates.paymentReceivedAdmin({
          clientName: booking.customers?.full_name || 'Customer',
          receiptNumber: payment.receipt_number,
          amountFormatted,
          method: payment.method,
          transactionReference: payment.reference_note,
          bookingNumber: booking.booking_number,
          balanceRemaining: balanceFormatted,
          dashboardUrl: APP_CONFIG.getStudioAdminUrl(biz?.slug, 'payments'),
          businessName: biz?.name || 'Bridal Studio',
        });

        await notificationService.queueNotification({
          businessId,
          recipient: biz.business_email,
          channel: 'EMAIL',
          subject: adminEmailTpl.subject,
          messageBody: adminEmailTpl.html,
          bookingId: booking.id,
          customerId: booking.customer_id,
          idempotencyKey: `pay_admin_alert_${payment.id}`,
        }).then((job) => job && notificationService.processJob(job.id));
      }
    } catch (notifErr) {
      console.warn('⚠️ Non-fatal notification error on payment recorded:', notifErr.message);
    }

    return {
      ...payment,
      amount_paise: Number(payment.amount_paise),
    };
  },

  /**
   * Get refund eligibility and financial summary for a booking
   */
  async getBookingRefundEligibility(businessId, bookingId) {
    const booking = await prisma.bookings.findFirst({
      where: {
        id: bookingId,
        business_id: businessId,
      },
      include: {
        customers: {
          select: {
            id: true,
            full_name: true,
            phone: true,
            email: true,
          },
        },
        payment_records: {
          orderBy: { paid_at: 'desc' },
        },
      },
    });

    if (!booking) {
      throw ApiError.notFound('Booking not found in this business');
    }

    const totalAmount = Number(booking.total_amount_paise || 0);
    const discount = Number(booking.discount_paise || 0);
    const netPayable = Math.max(0, totalAmount - discount);

    let totalPaymentsReceived = 0;
    let previousCompletedRefunds = 0;
    let previousPendingRefunds = 0;

    for (const p of booking.payment_records) {
      const amt = Number(p.amount_paise || 0);
      if (p.status === 'RECORDED') {
        totalPaymentsReceived += amt;
      } else if (p.status === 'REFUNDED') {
        previousCompletedRefunds += amt;
      } else if (p.status === 'PENDING_REFUND') {
        previousPendingRefunds += amt;
      }
    }

    const approvedRefundableAmount = Number(booking.approved_refundable_paise || 0);
    // Remaining refund balance cannot exceed approved amount minus already refunded (and pending), nor exceed total received minus refunded
    const remainingApprovedRefundable = Math.max(0, approvedRefundableAmount - previousCompletedRefunds - previousPendingRefunds);
    const maxPossibleRefundable = Math.max(0, totalPaymentsReceived - previousCompletedRefunds - previousPendingRefunds);
    const remainingRefundBalance = Math.min(remainingApprovedRefundable, maxPossibleRefundable);

    // Determine refund status badge
    let refundStatus = 'NOT_ELIGIBLE';
    if (booking.status === 'CANCELLED') {
      if (totalPaymentsReceived === 0) {
        refundStatus = 'NOT_ELIGIBLE';
      } else if (approvedRefundableAmount === 0) {
        refundStatus = 'APPROVAL_REQUIRED';
      } else if (previousCompletedRefunds >= approvedRefundableAmount && approvedRefundableAmount > 0) {
        refundStatus = 'REFUNDED';
      } else if (previousPendingRefunds > 0) {
        refundStatus = 'REFUND_PENDING';
      } else if (previousCompletedRefunds > 0 && previousCompletedRefunds < approvedRefundableAmount) {
        refundStatus = 'PARTIALLY_REFUNDED';
      } else {
        refundStatus = 'REFUND_PENDING';
      }
    }

    return {
      booking_id: booking.id,
      booking_number: booking.booking_number,
      booking_status: booking.status,
      customer: booking.customers,
      cancellation_reason: booking.cancellation_reason,
      refund_approved_at: booking.refund_approved_at,
      refund_approval_notes: booking.refund_approval_notes,
      financial_summary: {
        original_booking_total_paise: totalAmount,
        discount_paise: discount,
        net_payable_paise: netPayable,
        total_payments_received_paise: totalPaymentsReceived,
        previous_completed_refunds_paise: previousCompletedRefunds,
        previous_pending_refunds_paise: previousPendingRefunds,
        approved_refundable_amount_paise: approvedRefundableAmount,
        remaining_refund_balance_paise: remainingRefundBalance,
        max_possible_refundable_paise: maxPossibleRefundable,
        currency: 'INR',
      },
      refund_status: refundStatus,
      payment_history: booking.payment_records.map((p) => ({
        id: p.id,
        receipt_number: p.receipt_number,
        amount_paise: Number(p.amount_paise),
        method: p.method,
        status: p.status,
        paid_at: p.paid_at,
        reference_note: p.reference_note,
        notes: p.notes,
      })),
    };
  },

  /**
   * Studio user specifies / confirms the approved refundable amount according to studio cancellation policy
   */
  async approveBookingRefund(businessId, userId, bookingId, data) {
    const booking = await prisma.bookings.findFirst({
      where: {
        id: bookingId,
        business_id: businessId,
      },
      include: {
        payment_records: true,
      },
    });

    if (!booking) {
      throw ApiError.notFound('Booking not found in this business');
    }

    if (booking.status !== 'CANCELLED') {
      throw ApiError.badRequest('Refund approval is only applicable to cancelled bookings');
    }

    const approvedPaise = BigInt(data.approved_refundable_paise || 0);
    if (approvedPaise < BigInt(0)) {
      throw ApiError.badRequest('Approved refundable amount cannot be negative');
    }

    // Verify it does not exceed total payments actually received
    const totalPaidPaise = booking.payment_records
      .filter((p) => p.status === 'RECORDED')
      .reduce((acc, p) => acc + BigInt(p.amount_paise), BigInt(0));

    if (approvedPaise > totalPaidPaise) {
      throw ApiError.badRequest(
        `Approved refundable amount (₹${Number(approvedPaise) / 100}) cannot exceed total payments actually received (₹${Number(totalPaidPaise) / 100})`
      );
    }

    const updated = await prisma.bookings.update({
      where: { id: bookingId },
      data: {
        approved_refundable_paise: approvedPaise,
        refund_approval_notes: data.notes || null,
        refund_approved_by: userId,
        refund_approved_at: new Date(),
      },
    });

    return {
      booking_id: updated.id,
      booking_number: updated.booking_number,
      approved_refundable_paise: Number(updated.approved_refundable_paise),
      refund_approval_notes: updated.refund_approval_notes,
      refund_approved_at: updated.refund_approved_at,
    };
  },

  /**
   * Record a customer refund against a cancelled booking
   */
  async recordCustomerRefund(businessId, userId, data) {
    // 1. Fetch booking and lock within transaction
    return await prisma.$transaction(async (tx) => {
      const booking = await tx.bookings.findFirst({
        where: {
          id: data.booking_id,
          business_id: businessId,
        },
        include: {
          customers: true,
          payment_records: true,
        },
      });

      if (!booking) {
        throw ApiError.badRequest('Referenced booking does not exist in this business');
      }

      // Requirement 2: Allow refunds only for bookings that have been cancelled
      if (booking.status !== 'CANCELLED') {
        throw ApiError.badRequest('Refunds can only be recorded for cancelled bookings.');
      }

      const refundAmountPaise = BigInt(data.refund_amount_paise);
      if (refundAmountPaise <= BigInt(0)) {
        throw ApiError.badRequest('Refund amount must be greater than zero');
      }

      // Calculate total payments received and already refunded
      let totalReceivedPaise = BigInt(0);
      let totalRefundedPaise = BigInt(0);
      let totalPendingRefundsPaise = BigInt(0);

      for (const p of booking.payment_records) {
        if (p.status === 'RECORDED') {
          totalReceivedPaise += BigInt(p.amount_paise);
        } else if (p.status === 'REFUNDED') {
          totalRefundedPaise += BigInt(p.amount_paise);
        } else if (p.status === 'PENDING_REFUND') {
          totalPendingRefundsPaise += BigInt(p.amount_paise);
        }
      }

      if (totalReceivedPaise === BigInt(0)) {
        throw ApiError.badRequest('No payments were received for this booking to refund');
      }

      // Check approved refundable amount
      const approvedRefundablePaise = BigInt(booking.approved_refundable_paise || 0);
      if (approvedRefundablePaise === BigInt(0)) {
        throw ApiError.badRequest(
          'No refundable amount has been approved for this cancelled booking. Please specify and confirm the approved refundable amount first.'
        );
      }

      // Calculate remaining refundable balance
      const remainingApprovedPaise = approvedRefundablePaise - totalRefundedPaise - totalPendingRefundsPaise;
      const maxPossiblePaise = totalReceivedPaise - totalRefundedPaise - totalPendingRefundsPaise;
      const effectiveRemainingPaise = remainingApprovedPaise < maxPossiblePaise ? remainingApprovedPaise : maxPossiblePaise;

      if (refundAmountPaise > effectiveRemainingPaise) {
        throw ApiError.badRequest(
          `Refund amount (₹${Number(refundAmountPaise) / 100}) exceeds the remaining approved refundable balance of ₹${Number(effectiveRemainingPaise) / 100}`
        );
      }

      // Ensure total refunds do not exceed actual payments received
      if (totalRefundedPaise + refundAmountPaise > totalReceivedPaise) {
        throw ApiError.badRequest(
          `Total refunds (₹${Number(totalRefundedPaise + refundAmountPaise) / 100}) cannot exceed the total amount actually paid (₹${Number(totalReceivedPaise) / 100})`
        );
      }

      // Generate refund reference automatically if user does not provide one
      const refundReference = data.refund_reference?.trim() || `REF-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

      // Prevent duplicate receipt/refund reference in this business
      const existingRef = await tx.payment_records.findUnique({
        where: {
          business_id_receipt_number: {
            business_id: businessId,
            receipt_number: refundReference,
          },
        },
      });

      if (existingRef) {
        throw ApiError.conflict('A transaction record with this reference number already exists in your studio');
      }

      // Refund status: Pending vs Completed (REFUND_PENDING vs REFUNDED)
      const isCompleted = data.status === 'REFUNDED' || data.confirm_completed === true;
      const finalStatus = isCompleted ? 'REFUNDED' : 'PENDING_REFUND';

      const refundDate = data.refund_date ? new Date(data.refund_date) : new Date();

      // Combine notes and reason
      const combinedNotes = [
        data.reason ? `Reason: ${data.reason}` : null,
        data.original_payment_id ? `Original Payment Ref ID: ${data.original_payment_id}` : null,
        data.notes ? `Internal Notes: ${data.notes}` : null,
      ]
        .filter(Boolean)
        .join(' | ');

      const refundRecord = await tx.payment_records.create({
        data: {
          business_id: businessId,
          booking_id: booking.id,
          customer_id: booking.customer_id,
          amount_paise: refundAmountPaise,
          method: data.method || 'UPI',
          status: finalStatus,
          paid_at: refundDate,
          receipt_number: refundReference,
          reference_note: data.reference_note || null, // UTR / Transaction Ref
          notes: combinedNotes || null,
          recorded_by: userId,
        },
        include: {
          bookings: {
            select: {
              id: true,
              booking_number: true,
              status: true,
              total_amount_paise: true,
              approved_refundable_paise: true,
            },
          },
          customers: {
            select: {
              id: true,
              full_name: true,
              phone: true,
              email: true,
            },
          },
          users: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      const finalRefundData = {
        ...refundRecord,
        amount_paise: Number(refundRecord.amount_paise),
        remaining_balance_paise: Number(effectiveRemainingPaise - refundAmountPaise),
      };

      // Workflow #6: Dispatch Refund Confirmation Email to Customer if status is CONFIRMED / REFUNDED
      if (finalStatus === 'REFUNDED') {
        (async () => {
          try {
            const custEmail = refundRecord.customers?.email;
            if (!custEmail) return;

            const biz = await prisma.businesses.findUnique({
              where: { id: businessId },
              select: { name: true, business_email: true, business_phone: true, logo_url: true },
            });

            const bizName = biz?.name || 'Bridal Studio';
            const refundDateStr = refundDate.toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            });

            const refundFormatted = (Number(refundAmountPaise) / 100).toFixed(2);
            const bookingTotalFormatted = (Number(booking.total_amount_paise) / 100).toFixed(2);
            const totalPaidFormatted = (Number(totalReceivedPaise) / 100).toFixed(2);

            const template = emailTemplates.refundConfirmationCustomer({
              clientName: refundRecord.customers?.full_name || 'Valued Customer',
              studioName: bizName,
              logoUrl: biz?.logo_url || null,
              bookingNumber: booking.booking_number,
              originalBookingAmount: bookingTotalFormatted,
              totalAmountPaid: totalPaidFormatted,
              refundAmount: refundFormatted,
              refundMethod: data.method || 'UPI / Bank Transfer',
              refundTransactionId: data.reference_note || refundReference,
              refundProcessedDateStr: refundDateStr,
              refundStatus: 'REFUNDED',
              expectedProcessingTime: '3-5 business days',
              studioPhone: biz?.business_phone,
              studioEmail: biz?.business_email,
            });

            const job = await notificationService.queueNotification({
              businessId,
              recipient: custEmail,
              channel: 'EMAIL',
              subject: template.subject,
              messageBody: template.html,
              idempotencyKey: `refund_confirm_email_${refundRecord.id}`,
              customerId: booking.customer_id,
              bookingId: booking.id,
              notificationType: 'TRANSACTIONAL',
              templateName: 'refund_confirmation_customer',
              templateParams: {
                refundAmount: refundFormatted,
                receiptNumber: refundReference,
                bookingNumber: booking.booking_number,
              },
            });

            if (job) {
              await notificationService.processJob(job.id);
            }
          } catch (refundEmailErr) {
            console.error('[PaymentService] Failed to send refund confirmation email:', refundEmailErr.message);
          }
        })();
      }

      return finalRefundData;
    });
  },

  /**
   * List payments with pagination, booking, method, transaction type, and date range filters
   */
  async listPayments(businessId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = {
      business_id: businessId,
    };

    if (query.booking_id) where.booking_id = query.booking_id;
    if (query.customer_id) where.customer_id = query.customer_id;
    if (query.method) where.method = query.method;

    // Filter by transaction type (PAYMENT vs REFUND)
    if (query.type === 'PAYMENT') {
      where.status = 'RECORDED';
    } else if (query.type === 'REFUND') {
      where.status = { in: ['REFUNDED', 'PENDING_REFUND'] };
    } else if (query.status) {
      where.status = query.status;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { receipt_number: { contains: term, mode: 'insensitive' } },
        { reference_note: { contains: term, mode: 'insensitive' } },
        { notes: { contains: term, mode: 'insensitive' } },
        {
          customers: {
            OR: [
              { full_name: { contains: term, mode: 'insensitive' } },
              { phone: { contains: term, mode: 'insensitive' } },
            ],
          },
        },
        {
          bookings: {
            booking_number: { contains: term, mode: 'insensitive' },
          },
        },
      ];
    }

    if (query.startDate || query.endDate) {
      where.paid_at = {
        ...(query.startDate ? { gte: new Date(`${query.startDate}T00:00:00.000Z`) } : {}),
        ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) } : {}),
      };
    }

    const sortBy = query.sortBy || 'paid_at';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [total, payments] = await prisma.$transaction([
      prisma.payment_records.count({ where }),
      prisma.payment_records.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          bookings: {
            select: {
              id: true,
              booking_number: true,
              status: true,
              total_amount_paise: true,
              discount_paise: true,
              approved_refundable_paise: true,
            },
          },
          customers: {
            select: {
              id: true,
              full_name: true,
              phone: true,
              email: true,
            },
          },
          users: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    const formatted = payments.map((p) => {
      const isRefund = p.status === 'REFUNDED' || p.status === 'PENDING_REFUND';
      return {
        id: p.id,
        booking_id: p.booking_id,
        booking_number: p.bookings?.booking_number,
        booking_status: p.bookings?.status,
        booking_total_paise: Number(p.bookings?.total_amount_paise || 0),
        booking_discount_paise: Number(p.bookings?.discount_paise || 0),
        approved_refundable_paise: Number(p.bookings?.approved_refundable_paise || 0),
        customer_id: p.customer_id,
        customer_name: p.customers?.full_name,
        customer_phone: p.customers?.phone,
        customer_email: p.customers?.email,
        recorded_by: p.users?.name,
        amount_paise: Number(p.amount_paise),
        method: p.method,
        status: p.status,
        transaction_type: isRefund ? 'REFUND' : 'PAYMENT',
        paid_at: p.paid_at,
        receipt_number: p.receipt_number,
        reference_note: p.reference_note,
        notes: p.notes,
        created_at: p.created_at,
      };
    });

    return {
      payments: formatted,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get single payment record with business scoping
   */
  async getPaymentById(businessId, paymentId) {
    const payment = await prisma.payment_records.findFirst({
      where: {
        id: paymentId,
        business_id: businessId,
      },
      include: {
        bookings: {
          select: {
            id: true,
            booking_number: true,
            status: true,
            total_amount_paise: true,
          },
        },
        customers: {
          select: {
            id: true,
            full_name: true,
            phone: true,
            email: true,
          },
        },
        users: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!payment) {
      throw ApiError.notFound('Payment record not found in this business');
    }

    return {
      ...payment,
      amount_paise: Number(payment.amount_paise),
      bookings: {
        ...payment.bookings,
        total_amount_paise: Number(payment.bookings.total_amount_paise),
      },
    };
  },

  /**
   * Get detailed payment receipt for a payment record
   */
  async getPaymentReceipt(businessId, paymentId) {
    const payment = await prisma.payment_records.findFirst({
      where: {
        id: paymentId,
        business_id: businessId,
      },
      include: {
        businesses: {
          select: {
            id: true,
            name: true,
            logo_url: true,
            business_phone: true,
            business_email: true,
            whatsapp_phone: true,
            address_line1: true,
            city: true,
            state: true,
            currency: true,
          },
        },
        customers: {
          select: {
            id: true,
            full_name: true,
            phone: true,
            email: true,
            city: true,
          },
        },
        bookings: {
          select: {
            id: true,
            booking_number: true,
            status: true,
            total_amount_paise: true,
            discount_paise: true,
          },
        },
        users: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!payment) {
      throw ApiError.notFound('Payment record not found in this business');
    }

    const netPayable = Math.max(0, Number(payment.bookings.total_amount_paise) - Number(payment.bookings.discount_paise));

    return {
      receipt: {
        receipt_number: payment.receipt_number,
        payment_id: payment.id,
        paid_at: payment.paid_at,
        amount_paise: Number(payment.amount_paise),
        amount_formatted: `₹${(Number(payment.amount_paise) / 100).toFixed(2)}`,
        payment_method: payment.method,
        payment_status: payment.status,
        reference_note: payment.reference_note,
        notes: payment.notes,
        recorded_by: payment.users?.name || 'Studio Staff',
      },
      business: payment.businesses,
      customer: payment.customers,
      booking: {
        booking_id: payment.bookings.id,
        booking_number: payment.bookings.booking_number,
        total_amount_paise: Number(payment.bookings.total_amount_paise),
        discount_paise: Number(payment.bookings.discount_paise),
        net_payable_paise: netPayable,
      },
    };
  },

  /**
   * Refund a recorded payment
   */
  async refundPayment(businessId, userId, paymentId, refundData) {
    const payment = await prisma.payment_records.findFirst({
      where: {
        id: paymentId,
        business_id: businessId,
      },
      include: {
        bookings: true,
      },
    });

    if (!payment) {
      throw ApiError.notFound('Payment record not found in this business');
    }

    if (payment.status === 'REFUNDED') {
      throw ApiError.badRequest('This payment has already been marked as refunded');
    }

    if (payment.status === 'VOIDED') {
      throw ApiError.badRequest('A voided payment cannot be refunded');
    }

    const originalAmount = Number(payment.amount_paise);
    const refundAmount = refundData.refund_amount_paise !== undefined
      ? Number(refundData.refund_amount_paise)
      : originalAmount;

    if (refundAmount <= 0) {
      throw ApiError.badRequest('Refund amount must be greater than zero');
    }

    if (refundAmount > originalAmount) {
      throw ApiError.badRequest(`Refund amount (₹${refundAmount / 100}) cannot exceed the original payment amount (₹${originalAmount / 100})`);
    }

    const reason = refundData.reason;

    // Use Prisma transaction to preserve financial records atomically
    const result = await prisma.$transaction(async (tx) => {
      let updatedPayment;

      if (refundAmount === originalAmount) {
        // Full refund: Update status to REFUNDED
        updatedPayment = await tx.payment_records.update({
          where: { id: paymentId },
          data: {
            status: 'REFUNDED',
            notes: payment.notes
              ? `${payment.notes} | Refunded on ${new Date().toISOString()}: ${reason}`
              : `Refunded: ${reason}`,
          },
        });
      } else {
        // Partial refund: Adjust original payment amount and record negative refund line
        const remainingAmount = BigInt(originalAmount - refundAmount);
        updatedPayment = await tx.payment_records.update({
          where: { id: paymentId },
          data: {
            amount_paise: remainingAmount,
            notes: payment.notes
              ? `${payment.notes} | Partial refund of ₹${refundAmount / 100}: ${reason}`
              : `Partial refund of ₹${refundAmount / 100}: ${reason}`,
          },
        });

        // Record partial refund record
        const refundReceipt = `REF-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        await tx.payment_records.create({
          data: {
            business_id: businessId,
            booking_id: payment.booking_id,
            customer_id: payment.customer_id,
            amount_paise: BigInt(refundAmount),
            method: refundData.refund_method || payment.method,
            status: 'REFUNDED',
            receipt_number: refundReceipt,
            reference_note: refundData.reference_note || `Partial refund for ${payment.receipt_number}`,
            notes: reason,
            recorded_by: userId,
          },
        });
      }

      return updatedPayment;
    });

    return {
      ...result,
      amount_paise: Number(result.amount_paise),
      refunded_amount_paise: refundAmount,
      reason,
    };
  },

  /**
   * Booking Payment History & Reconciliation
   */
  async getBookingPayments(businessId, bookingId) {
    const booking = await prisma.bookings.findFirst({
      where: {
        id: bookingId,
        business_id: businessId,
      },
      include: {
        payment_records: {
          orderBy: { paid_at: 'desc' },
          include: {
            users: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!booking) {
      throw ApiError.notFound('Booking not found in this business');
    }

    const totalAmount = Number(booking.total_amount_paise);
    const discount = Number(booking.discount_paise);
    const netPayable = Math.max(0, totalAmount - discount);

    let totalCollected = 0;
    let totalRefunded = 0;
    let totalPendingRefunds = 0;

    for (const p of booking.payment_records) {
      if (p.status === 'RECORDED') {
        totalCollected += Number(p.amount_paise);
      } else if (p.status === 'REFUNDED') {
        totalRefunded += Number(p.amount_paise);
      } else if (p.status === 'PENDING_REFUND') {
        totalPendingRefunds += Number(p.amount_paise);
      }
    }

    const netReceived = Math.max(0, totalCollected - totalRefunded);
    const balanceDue = Math.max(0, netPayable - netReceived);
    const approvedRefundableAmount = Number(booking.approved_refundable_paise || 0);
    const remainingRefundBalance = Math.max(0, Math.min(approvedRefundableAmount - totalRefunded - totalPendingRefunds, totalCollected - totalRefunded - totalPendingRefunds));

    return {
      booking_id: booking.id,
      booking_number: booking.booking_number,
      booking_status: booking.status,
      payment_summary: {
        total_amount_paise: totalAmount,
        discount_paise: discount,
        net_payable_paise: netPayable,
        total_collected_paise: totalCollected,
        total_refunded_paise: totalRefunded,
        total_pending_refunds_paise: totalPendingRefunds,
        approved_refundable_paise: approvedRefundableAmount,
        remaining_refund_balance_paise: remainingRefundBalance,
        net_received_paise: netReceived,
        balance_due_paise: balanceDue,
        currency: 'INR',
        is_fully_paid: balanceDue === 0,
      },
      payments: booking.payment_records.map((p) => ({
        id: p.id,
        amount_paise: Number(p.amount_paise),
        method: p.method,
        status: p.status,
        paid_at: p.paid_at,
        receipt_number: p.receipt_number,
        reference_note: p.reference_note,
        notes: p.notes,
        recorded_by: p.users?.name || null,
      })),
    };
  },

  /**
   * Get overall payment metrics and financial summary for the authorized business
   */
  async getPaymentMetrics(businessId, query = {}) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [allPayments, todayPayments, activeBookings] = await Promise.all([
      prisma.payment_records.findMany({
        where: { business_id: businessId },
        select: {
          amount_paise: true,
          status: true,
          method: true,
        },
      }),
      prisma.payment_records.findMany({
        where: {
          business_id: businessId,
          status: 'RECORDED',
          paid_at: { gte: todayStart, lte: todayEnd },
        },
        select: { amount_paise: true },
      }),
      prisma.bookings.findMany({
        where: {
          business_id: businessId,
          status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] },
        },
        select: {
          total_amount_paise: true,
          discount_paise: true,
          payment_records: {
            select: { amount_paise: true, status: true },
          },
        },
      }),
    ]);

    let totalCollectedPaise = 0;
    let totalRefundedPaise = 0;
    let advanceCollectedPaise = 0;
    const methodBreakdown = {};

    for (const p of allPayments) {
      const amt = Number(p.amount_paise);
      if (p.status === 'RECORDED') {
        totalCollectedPaise += amt;
        methodBreakdown[p.method] = (methodBreakdown[p.method] || 0) + amt;
      } else if (p.status === 'REFUNDED') {
        totalRefundedPaise += amt;
      }
    }

    const todayCollectionPaise = todayPayments.reduce((sum, p) => sum + Number(p.amount_paise), 0);

    let outstandingBalancePaise = 0;
    for (const b of activeBookings) {
      const netPayable = Math.max(0, Number(b.total_amount_paise) - Number(b.discount_paise));
      let paid = 0;
      let refunded = 0;
      for (const pr of b.payment_records) {
        if (pr.status === 'RECORDED') paid += Number(pr.amount_paise);
        else if (pr.status === 'REFUNDED') refunded += Number(pr.amount_paise);
      }
      const netPaid = Math.max(0, paid - refunded);
      // Advance payments: payments made towards active bookings
      advanceCollectedPaise += netPaid;
      outstandingBalancePaise += Math.max(0, netPayable - netPaid);
    }

    return {
      total_collected_paise: totalCollectedPaise,
      total_refunded_paise: totalRefundedPaise,
      net_collected_paise: Math.max(0, totalCollectedPaise - totalRefundedPaise),
      today_collection_paise: todayCollectionPaise,
      advance_collected_paise: advanceCollectedPaise,
      outstanding_balance_paise: outstandingBalancePaise,
      payment_method_breakdown: methodBreakdown,
      currency: 'INR',
    };
  },
};
