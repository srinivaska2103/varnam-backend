/**
 * Reserved Route Slugs for the SaaS Platform
 * 
 * These slugs cannot be claimed as business slugs/subdomains because they
 * clash with Next.js dashboard routes, authentication paths, API endpoints,
 * or vital system assets.
 */
export const RESERVED_SLUGS = Object.freeze([
  // Core system & auth routes
  'admin',
  'api',
  'app',
  'auth',
  'login',
  'logout',
  'register',
  'signup',
  'signin',
  'forgot-password',
  'reset-password',
  'verify-email',
  
  // Dashboard application pages
  'dashboard',
  'overview',
  'settings',
  'account',
  'website',
  'subscription',
  'billing',
  'payments',
  'customers',
  'clients',
  'bookings',
  'calendar',
  'consultations',
  'enquiries',
  'expenses',
  'inventory',
  'notifications',
  'packages',
  'quotations',
  'reports',
  'services',
  'portfolio',
  
  // Static assets & system endpoints
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'icon.png',
  'apple-icon.png',
  'static',
  'public',
  'assets',
  'terms',
  'privacy',
  'help',
  'support',
  'contact',
  'null',
  'undefined',
  'test',
]);

/**
 * Validates whether a proposed slug is reserved.
 * @param {string} slug
 * @returns {boolean} true if slug is forbidden
 */
export function isReservedSlug(slug) {
  if (!slug || typeof slug !== 'string') return true;
  const normalized = slug.trim().toLowerCase();
  return RESERVED_SLUGS.includes(normalized);
}

/**
 * Generates an alternative slug suggestion if the base slug is taken or reserved.
 * @param {string} baseSlug
 * @param {number} attempt
 * @returns {string} suggested slug
 */
export function suggestAlternativeSlug(baseSlug, attempt = 1) {
  const clean = (baseSlug || 'studio')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${clean}-${attempt}`;
}
