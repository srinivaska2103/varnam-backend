/**
 * whatsappTemplates.js
 * 
 * Formal parameter definitions and message formatting for the 9 WhatsApp Templates
 * in the VARNAM Bridal Software suite.
 * 
 * Verified against Meta WhatsApp Cloud API (WABA ID: 1438988877738498).
 * Templates use named parameters and language 'en'.
 */

export const WHATSAPP_TEMPLATES = {
  // 1. Customer Enquiry Acknowledgement
  CUSTOMER_ENQUIRY_ACK: {
    templateName: 'new_enquiry_notification',
    category: 'UTILITY',
    language: 'en',
    description: 'Sent to bride/customer upon successful enquiry submission',
    headerParams: ['customer_name'],
    requiredParams: ['studio_name', 'event_date', 'service_name', 'studio_location'],
    format: ({ customer_name, studio_name, event_date, service_name, studio_location }) =>
`Hi ${customer_name || 'there'}!

Thank you for contacting ${studio_name || 'our studio'} for your special day! 

We've received your enquiry.

 Event Date: ${event_date || 'Date to be confirmed'}
 Service: ${service_name || 'Bridal Makeup'}
 Studio Location: ${studio_location || 'Studio'}

Our team will contact you soon to discuss your requirements.

Varnam Management System`,
  },

  // 2. New Bridal Enquiry Notification to Studio Admin
  ADMIN_ENQUIRY_ALERT: {
    templateName: 'new_enquiry_alert__admin',
    category: 'UTILITY',
    language: 'en',
    description: 'Sent to studio owner / admin upon receiving a new customer enquiry',
    requiredParams: ['customer_name', 'customer_phone', 'event_date', 'service_name'],
    format: ({ customer_name, customer_phone, event_date, service_name }) =>
`New Bridal Enquiry!

You have received a new customer enquiry.

 Customer: ${customer_name || 'Prospective Bride'}
 Phone: ${customer_phone || 'Not provided'}
 Event Date: ${event_date || 'To be scheduled'}
 Service: ${service_name || 'Bridal Services'}

📌 Please contact the customer and update the enquiry status in your dashboard.

Varnam Management System`,
  },

  // 3. Booking Confirmation
  BOOKING_CONFIRMATION: {
    templateName: 'booking_confirmation__customer',
    category: 'UTILITY',
    language: 'en',
    description: 'Sent to customer when booking is confirmed',
    requiredParams: ['customer_name', 'studio_name', 'event_date', 'event_time', 'package_name', 'event_location', 'total_amount', 'amount_paid', 'balance_due'],
    format: ({ customer_name, studio_name, event_date, event_time, package_name, event_location, total_amount, amount_paid, balance_due }) =>
`Booking confirmation

Hi ${customer_name || 'valued client'},

Your booking with ${studio_name || 'our studio'} has been confirmed! ❤️

Event Date: ${event_date || 'Scheduled Date'}
Time: ${event_time || 'Time to be coordinated'}
Package: ${package_name || 'Bridal Package'}
Location: ${event_location || 'Studio Venue'}

Total Amount: ₹${total_amount ?? '0'}
Amount Paid: ₹${amount_paid ?? '0'}
 Balance Due: ₹${balance_due ?? '0'}

We're excited to be part of your special day!

Please contact us if you need any changes.

Varnam Management System`,
  },

  // 4. Consultation Reminder
  CONSULTATION_REMINDER: {
    templateName: 'consultation_reminder__customer',
    category: 'UTILITY',
    language: 'en',
    description: 'Sent to customer prior to scheduled consultation',
    requiredParams: ['customer_name', 'studio_name', 'consultation_date', 'consultation_time', 'studio_location'],
    format: ({ customer_name, studio_name, consultation_date, consultation_time, studio_location }) =>
`Consultation reminder

Hi ${customer_name || 'there'}!

This is a friendly reminder about your upcoming bridal consultation with ${studio_name || 'our studio'}.

Date: ${consultation_date || 'Scheduled Date'}
Time: ${consultation_time || 'Scheduled Time'}
Location: ${studio_location || 'Studio'}

Please let us know if you need to reschedule.

We look forward to meeting you! ❤️

Varnam Management System`,
  },

  // 5. Pending Balance Payment Reminder
  PENDING_BALANCE_REMINDER: {
    templateName: 'pending_balance_payment_reminder',
    category: 'UTILITY',
    language: 'en',
    description: 'Sent to customer with positive outstanding balance',
    requiredParams: ['studio_name', 'customer_name', 'package_name', 'event_date', 'total_amount', 'amount_paid', 'balance_due', 'due_date'],
    format: ({ studio_name, customer_name, package_name, event_date, total_amount, amount_paid, balance_due, due_date }) =>
`Pending balance payment reminder

Payment Reminder — ${studio_name || 'Bridal Studio'}

Hi ${customer_name || 'there'},

This is a friendly reminder regarding the balance payment for your upcoming event.

Package: ${package_name || 'Bridal Styling'}
Event Date: ${event_date || 'Upcoming'}
Total Amount: ₹${total_amount ?? '0'}
Paid: ₹${amount_paid ?? '0'}
Balance Due: ₹${balance_due ?? '0'}
Payment Due Date: ${due_date || 'Before Event'}

Please contact us if you have already completed the payment.

Thank you! ❤️

Varnam  Management System`,
  },

  // 6. Event Preparation Reminder
  EVENT_PREPARATION_REMINDER: {
    templateName: 'event_preparation_reminder__two_days_before',
    category: 'UTILITY',
    language: 'en',
    description: 'Sent 2 days prior to confirmed wedding/event date to customer & admin',
    requiredParams: ['customer_name', 'studio_name', 'event_date', 'package_name', 'event_location'],
    format: ({ customer_name, studio_name, event_date, package_name, event_location }) =>
`Event preparation reminder

✨ Your Special Day Is Almost Here!

Hi ${customer_name || 'there'}! ❤️

Your event with ${studio_name || 'our studio'} is just 2 days away!

Event Date: ${event_date || 'Scheduled Date'}
Package: ${package_name || 'Bridal Package'}
Location: ${event_location || 'Event Location'}

Please confirm any final requirements with our team.

We look forward to making your special day beautiful! ✨

Varnam Management System`,
  },

  // 7. Subscription Expiry Reminder
  SUBSCRIPTION_EXPIRY_REMINDER: {
    templateName: 'subscription_expiry_reminder__studio_admin',
    category: 'UTILITY',
    language: 'en',
    description: 'Sent to studio owner before subscription expires',
    requiredParams: ['admin_name', 'plan_name', 'studio_name', 'expiry_date', 'subscription_status'],
    format: ({ admin_name, plan_name, studio_name, expiry_date, subscription_status }) =>
`Subscription expiry reminder

🔔 *Subscription Renewal Reminder*

Hi ${admin_name || 'Studio Owner'},

Your ${plan_name || 'Studio Plan'} subscription for ${studio_name || 'your studio'} will expire on ${expiry_date || 'soon'}.

Status: ${subscription_status || 'Active'}

Please visit your Subscription & Billing page to review your plan and renewal options.

Thank you for using our platform!

Varnam Management System`,
  },

  // 8. Bridal Consultation Follow-up
  CONSULTATION_FOLLOW_UP: {
    templateName: 'consulation_follow_template',
    category: 'UTILITY',
    language: 'en',
    description: 'Sent ~24 hours after a completed bridal consultation',
    requiredParams: ['customer_name', 'studio_name', 'consultation_date', 'interested_service'],
    format: ({ customer_name, studio_name, consultation_date, interested_service }) =>
`Bridal Consulation Follow UP

Hello ${customer_name || 'there'},

Thank you for choosing ${studio_name || 'our studio'} for your bridal consultation. We appreciate the opportunity to discuss your bridal requirements and preferences.

Consultation Date: ${consultation_date || 'Recent Consultation'}  
Service Interested In: ${interested_service || 'Bridal Makeup & Styling'}

We hope your consultation was helpful. If you have any questions or would like to proceed with your booking, please feel free to contact us. We would be delighted to assist you in planning your special day.

We look forward to hearing from you.

Varnam Management System`,
  },

  // 9. Special Bridal Packages Campaign (MANUAL, User-Triggered Only)
  SPECIAL_BRIDAL_PACKAGES: {
    templateName: 'marketing_campaign__special_bridal_package',
    category: 'MARKETING',
    language: 'en',
    description: 'Marketing campaign template triggered manually by studio user',
    requiredParams: ['studio_name', 'package_name', 'offer_description', 'offer_end_date'],
    format: ({ studio_name, package_name, offer_description, offer_end_date }) =>
`Special Bridal Packages

✨ Special Bridal Packages from ${studio_name || 'our studio'} ✨

Make your special day unforgettable! ❤️

Explore our bridal makeup packages and find the perfect look for your wedding.

Package: ${package_name || 'Exclusive Bridal Package'}
Offer: ${offer_description || 'Special Bridal Discount'}
Offer Valid Until: ${offer_end_date || 'Limited Time'}

Interested? Reply to this message or contact us to learn more.

We'd love to be part of your beautiful journey! ❤️

Varnam Management System`,
  },

  // 10. Booking Confirmation Payment Reminder (Workflow 1: maps to approved Meta template 'booking_confirmation__customer')
  BOOKING_CONFIRMATION_PAYMENT_REMINDER: {
    templateName: 'booking_confirmation__customer',
    category: 'UTILITY',
    language: 'en',
    description: 'Sent immediately after booking confirmation to inform customer about payment requirements and booking details',
    requiredParams: [
      'customer_name',
      'studio_name',
      'event_date',
      'event_time',
      'package_name',
      'event_location',
      'total_amount',
      'amount_paid',
      'balance_due',
    ],
    format: ({
      customer_name,
      studio_name,
      event_date,
      event_time,
      package_name,
      event_location,
      total_amount,
      amount_paid,
      balance_due,
    }) =>
`Booking confirmation

Hi ${customer_name || 'valued client'},

Your booking with ${studio_name || 'our studio'} has been confirmed! ❤️

Event Date: ${event_date || 'Scheduled Date'}
Time: ${event_time || 'Time to be coordinated'}
Package: ${package_name || 'Bridal Package'}
Location: ${event_location || 'Studio Venue'}

Total Amount: ₹${total_amount ?? '0'}
Amount Paid: ₹${amount_paid ?? '0'}
Balance Due: ₹${balance_due ?? '0'}

We're excited to be part of your special day!

Please contact us if you need any changes.

Varnam Management System`,
  },

  // 11. Post-Event Payment Balance Reminder (Workflow 2: maps to approved Meta template 'pending_balance_payment_reminder')
  POST_EVENT_BALANCE_REMINDER: {
    templateName: 'pending_balance_payment_reminder',
    category: 'UTILITY',
    language: 'en',
    description: 'Sent 48 hours after bridal event end date when outstanding balance is positive',
    requiredParams: [
      'studio_name',
      'customer_name',
      'package_name',
      'event_date',
      'total_amount',
      'amount_paid',
      'balance_due',
      'due_date',
    ],
    format: ({
      studio_name,
      customer_name,
      package_name,
      event_date,
      total_amount,
      amount_paid,
      balance_due,
      due_date,
    }) =>
`Pending balance payment reminder

Payment Reminder — ${studio_name || 'Bridal Studio'}

Hi ${customer_name || 'there'},

This is a friendly reminder regarding the balance payment for your upcoming event.

Package: ${package_name || 'Bridal Styling'}
Event Date: ${event_date || 'Upcoming'}
Total Amount: ₹${total_amount ?? '0'}
Paid: ₹${amount_paid ?? '0'}
Balance Due: ₹${balance_due ?? '0'}
Payment Due Date: ${due_date || 'Immediate'}

Please contact us if you have already completed the payment.

Thank you! ❤️

Varnam  Management System`,
  },
};

/**
 * Legacy & shortened aliases mapping to official registered Meta template names
 */
const TEMPLATE_NAME_ALIASES = {
  // Original internal keys
  customer_enquiry_ack: 'new_enquiry_notification',
  admin_enquiry_alert: 'new_enquiry_alert__admin',
  new_enquiry_alert: 'new_enquiry_alert__admin',
  booking_confirmation: 'booking_confirmation__customer',
  consultation_reminder: 'consultation_reminder__customer',
  pending_balance_reminder: 'pending_balance_payment_reminder',
  event_preparation_reminder: 'event_preparation_reminder__two_days_before',
  subscription_expiry_reminder: 'subscription_expiry_reminder__studio_admin',
  consultation_follow_up: 'consulation_follow_template',
  special_bridal_packages: 'marketing_campaign__special_bridal_package',
  booking_confirmation_payment_reminder: 'booking_confirmation_payment_reminder',
  post_event_balance_reminder: 'post_event_balance_reminder',

  // Shortened UI strings observed in Meta WhatsApp Manager table
  consulation_follow_te: 'consulation_follow_template',
  marketing_campaign_: 'marketing_campaign__special_bridal_package',
  subscription_expiry_re: 'subscription_expiry_reminder__studio_admin',
  event_preparation_rer: 'event_preparation_reminder__two_days_before',
  pending_balance_paym: 'pending_balance_payment_reminder',
  consultation_reminde: 'consultation_reminder__customer',
  new_enquiry_alert__a: 'new_enquiry_alert__admin',
};

/**
 * Resolves a WhatsApp template by uppercase key (e.g. 'CUSTOMER_ENQUIRY_ACK')
 * or by Meta templateName (e.g. 'new_enquiry_notification', 'booking_confirmation__customer')
 */
export function getWhatsAppTemplate(keyOrName) {
  if (!keyOrName) return null;
  // 1. Exact match on object key
  if (WHATSAPP_TEMPLATES[keyOrName]) return WHATSAPP_TEMPLATES[keyOrName];
  // 2. Uppercase match on object key
  const upper = String(keyOrName).toUpperCase();
  if (WHATSAPP_TEMPLATES[upper]) return WHATSAPP_TEMPLATES[upper];
  // 3. Match by exact templateName property
  const lower = String(keyOrName).toLowerCase();
  const directMatch = Object.values(WHATSAPP_TEMPLATES).find(
    (t) => t.templateName === keyOrName || t.templateName === lower
  );
  if (directMatch) return directMatch;

  // 4. Match by alias
  const resolvedName = TEMPLATE_NAME_ALIASES[keyOrName] || TEMPLATE_NAME_ALIASES[lower];
  if (resolvedName) {
    return (
      Object.values(WHATSAPP_TEMPLATES).find(
        (t) => t.templateName === resolvedName
      ) || null
    );
  }

  return null;
}

/**
 * Format message body for a given template key or Meta template name and parameter object
 */
export function formatWhatsAppMessage(templateKey, params = {}) {
  const tpl = getWhatsAppTemplate(templateKey);
  if (!tpl) {
    throw new Error(`Unknown WhatsApp template: ${templateKey}`);
  }
  return tpl.format(params);
}
