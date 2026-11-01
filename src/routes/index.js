import { Router } from 'express';
import { getHealth, getReadiness, getMonitoringData } from '../controllers/healthController.js';
import authRoutes from './auth.routes.js';
import businessRoutes from './business.routes.js';
import subscriptionRoutes from './subscription.routes.js';
import customerRoutes from './customer.routes.js';
import enquiryRoutes from './enquiry.routes.js';
import bookingRoutes from './booking.routes.js';
import paymentRoutes from './payment.routes.js';
import expenseRoutes from './expense.routes.js';
import reportRoutes from './report.routes.js';
import serviceRoutes from './service.routes.js';
import packageRoutes from './package.routes.js';
import quotationRoutes from './quotation.routes.js';
import consultationRoutes from './consultation.routes.js';
import inventoryRoutes from './inventory.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import websiteRoutes from './website.routes.js';
import portfolioRoutes from './portfolio.routes.js';
import publicRoutes from './public.routes.js';
import notificationRoutes from './notification.routes.js';
import campaignRoutes from './campaign.routes.js';
import adminRoutes from './admin.routes.js';
import webhookRoutes from './webhook.routes.js';
import whatsappBillingRoutes from './whatsapp-billing.routes.js';
import supportRoutes from './support.routes.js';

const router = Router();

/**
 * Health check endpoint
 * GET /api/health
 */
router.get('/health', getHealth);

/**
 * Readiness check endpoint
 * GET /api/ready
 */
router.get('/ready', getReadiness);

/**
 * Safe development & monitoring telemetry endpoint
 * GET /api/dev/monitoring-data
 */
router.get('/dev/monitoring-data', getMonitoringData);

/**
 * Authentication module endpoints
 * /api/auth/*
 */
router.use('/auth', authRoutes);

/**
 * Business management endpoints
 * /api/business/*
 */
router.use('/business', businessRoutes);

/**
 * Subscription plans and entitlement endpoints
 * /api/subscriptions/*
 */
router.use('/subscriptions', subscriptionRoutes);

/**
 * Customer management endpoints
 * /api/customers/*
 */
router.use('/customers', customerRoutes);

/**
 * Enquiry management and CRM endpoints
 * /api/enquiries/*
 */
router.use('/enquiries', enquiryRoutes);

/**
 * Booking management and wedding calendar endpoints
 * /api/bookings/*
 */
router.use('/bookings', bookingRoutes);

/**
 * Payment tracking and receipts endpoints
 * /api/payments/*
 */
router.use('/payments', paymentRoutes);

/**
 * Studio expense tracking endpoints
 * /api/expenses/*
 */
router.use('/expenses', expenseRoutes);

/**
 * Business financial reports endpoints
 * /api/reports/*
 */
router.use('/reports', reportRoutes);

/**
 * Services management endpoints
 * /api/services/*
 */
router.use('/services', serviceRoutes);

/**
 * Packages management endpoints
 * /api/packages/*
 */
router.use('/packages', packageRoutes);

/**
 * Quotations management endpoints
 * /api/quotations/*
 */
router.use('/quotations', quotationRoutes);

/**
 * Consultation management & calendar endpoints
 * /api/consultations/*
 */
router.use('/consultations', consultationRoutes);

/**
 * Inventory management & stock movement endpoints
 * /api/inventory/*
 */
router.use('/inventory', inventoryRoutes);

/**
 * Dashboard analytics & business reports endpoints
 * /api/dashboard/*
 */
router.use('/dashboard', dashboardRoutes);

/**
 * Branded website configuration endpoints (Exclusive Plan: BRANDED_WEBSITE)
 * /api/websites/*
 */
router.use('/websites', websiteRoutes);

/**
 * Portfolio items management endpoints (Exclusive Plan: PORTFOLIO_SHOWCASE)
 * /api/portfolio/*
 */
router.use('/portfolio', portfolioRoutes);

/**
 * Public website & catalog endpoints (No auth, published websites only)
 * /api/public/*
 */
router.use('/public', publicRoutes);

/**
 * Notifications and reminders endpoints
 * /api/notifications/*
 */
router.use('/notifications', notificationRoutes);

/**
 * Marketing campaigns endpoints
 * /api/campaigns/*
 */
router.use('/campaigns', campaignRoutes);

/**
 * Webhook endpoints for external providers (WhatsApp Cloud API, payment gateways)
 * /api/webhooks/*
 */
router.use('/webhooks', webhookRoutes);

/**
 * Super Admin Management & Analytics endpoints (Exclusively for Platform Owners)
 * /api/admin/*
 */
router.use('/admin', adminRoutes);

/**
 * Pay-As-You-Use WhatsApp Messaging Billing System endpoints
 * /api/whatsapp-billing/*
 */
router.use('/whatsapp-billing', whatsappBillingRoutes);

/**
 * Help Center & Support Ticket Management endpoints
 * /api/support/*
 */
router.use('/support', supportRoutes);

export default router;
