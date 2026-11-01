/**
 * Centralized Live & Environment Application URL Configuration for VARNAM SaaS.
 * 
 * Rules:
 * 1. Admin Live Login URL is strictly: https://app.varnam.vexatech.in/login
 * 2. Uses HTTPS and live domain in production, with consistent fallback to configured FRONTEND_URL.
 * 3. Never display admin login URLs in customer-facing emails.
 */

import { env } from './env.js';

export const APP_CONFIG = {
  // Live Primary Domains
  LIVE_APP_BASE_URL: 'https://app.varnam.vexatech.in',
  LIVE_ADMIN_LOGIN_URL: 'https://app.varnam.vexatech.in/login',

  // Dynamic Base URL based on environment
  getBaseUrl() {
    if (process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production') {
      return this.LIVE_APP_BASE_URL;
    }
    return env.FRONTEND_URL || this.LIVE_APP_BASE_URL;
  },

  // Official Admin Login URL for automated email CTAs
  getAdminLoginUrl() {
    return this.LIVE_ADMIN_LOGIN_URL;
  },

  // Studio Portal Admin link helper
  getStudioAdminUrl(studioSlug, path = 'dashboard') {
    const base = this.getBaseUrl();
    const cleanSlug = studioSlug || 'srinivasbridalstudio';
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${base}/${cleanSlug}/admin/${cleanPath}`;
  },

  // Public Studio Website link helper
  getPublicStudioUrl(studioSlug, customDomain = null) {
    if (customDomain && customDomain.trim()) {
      const cleaned = customDomain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      if (cleaned) {
        return `https://${cleaned}`;
      }
    }
    const base = this.getBaseUrl();
    const cleanSlug = (studioSlug || '').trim().replace(/^\/+/, '');
    return `${base}/${cleanSlug}`;
  },
};

