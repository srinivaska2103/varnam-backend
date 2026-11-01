import { APP_CONFIG } from '../config/appConfig.js';

/**
 * Reusable HTML and plain-text email template generators for Bridal SaaS notifications.
 * Escapes user-supplied content to prevent HTML injection / XSS.
 */

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function baseLayout({ title, heading, bodyHtml, businessName = 'VARNAM', logoUrl = null }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #fffaf5; margin: 0; padding: 24px; color: #1e293b; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #fed7aa; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(249, 115, 22, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #ea580c 0%, #f97316 50%, #c2410c 100%); padding: 28px 24px; text-align: center; color: #ffffff; }
    .logo-img { max-height: 48px; max-width: 160px; margin-bottom: 8px; display: inline-block; object-fit: contain; }
    .brand { font-size: 21px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin: 0; text-shadow: 0 1px 2px rgba(0,0,0,0.15); }
    .tagline { font-size: 13px; color: #ffedd5; margin-top: 5px; font-weight: 500; letter-spacing: 0.5px; }
    .content { padding: 32px 28px; }
    .greeting { font-size: 17px; font-weight: 700; margin-bottom: 12px; color: #0f172a; }
    .message { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 20px; }
    .detail-box { background: #fffaf5; border: 1px solid #fed7aa; border-radius: 10px; padding: 18px 20px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #fed7aa; font-size: 13px; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #9a3412; font-weight: 600; width: 42%; }
    .detail-value { color: #1c1917; font-weight: 700; text-align: right; width: 58%; word-break: break-word; }
    .alert-box { background: #fff7ed; border-left: 4px solid #f97316; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #9a3412; line-height: 1.5; margin: 20px 0; }
    .success-box { background: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #15803d; line-height: 1.5; margin: 20px 0; }
    .danger-box { background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #991b1b; line-height: 1.5; margin: 20px 0; }
    .cta-container { text-align: center; margin: 28px 0 16px 0; }
    .cta-btn { display: inline-block; background: linear-gradient(135deg, #ea580c 0%, #f97316 100%); color: #ffffff !important; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 14px rgba(234, 88, 12, 0.35); text-align: center; mso-padding-alt: 0; }
    .cta-admin-box { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0 12px 0; }
    .cta-admin-title { font-size: 13px; font-weight: 700; color: #9a3412; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .footer { padding: 20px 28px; background: #fffaf5; border-top: 1px solid #fed7aa; text-align: center; font-size: 11px; color: #9a3412; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(businessName)}" class="logo-img" /><br>` : ''}
      <h1 class="brand">${escapeHtml(businessName)}</h1>
      <div class="tagline">Bridal & Makeup Artistry SaaS</div>
    </div>
    <div class="content">
      <div class="greeting">${escapeHtml(heading)}</div>
      ${bodyHtml}
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} ${escapeHtml(businessName)}. Powered by VARNAM Bridal SaaS.<br>
      Automated studio notification. Please do not reply directly to this email.
    </div>
  </div>
</body>
</html>`;
}

export const emailTemplates = {
  /**
   * Consultation Confirmation / Reminder
   */
  consultation({ clientName, dateStr, timeStr, consultationType, notes, businessName = 'Bridal Studio' }) {
    const title = `Consultation Scheduled - ${businessName}`;
    const heading = `Hello ${escapeHtml(clientName)},`;
    const bodyHtml = `
      <div class="message">Your bridal makeup trial / consultation has been scheduled with <strong>${escapeHtml(businessName)}</strong>.</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Client Name:</span><span class="detail-value">${escapeHtml(clientName)}</span></div>
        <div class="detail-row"><span class="detail-label">Date:</span><span class="detail-value">${escapeHtml(dateStr)}</span></div>
        <div class="detail-row"><span class="detail-label">Time:</span><span class="detail-value">${escapeHtml(timeStr)}</span></div>
        <div class="detail-row"><span class="detail-label">Type:</span><span class="detail-value">${escapeHtml(consultationType)}</span></div>
        ${notes ? `<div class="detail-row"><span class="detail-label">Notes:</span><span class="detail-value">${escapeHtml(notes)}</span></div>` : ''}
      </div>
      <div class="message">We look forward to curating your perfect bridal look!</div>
    `;

    return {
      subject: `Bridal Consultation Confirmed: ${dateStr} - ${businessName}`,
      html: baseLayout({ title, heading, bodyHtml, businessName }),
      text: `Hello ${clientName},\n\nYour consultation with ${businessName} is scheduled for ${dateStr} at ${timeStr} (${consultationType}).\n\n— ${businessName}`,
    };
  },

  /**
   * Booking Confirmed / Rescheduled
   */
  bookingConfirmation({ clientName, bookingNumber, totalAmount, eventDate, venue, businessName = 'Bridal Studio' }) {
    const title = `Booking Confirmed #${bookingNumber} - ${businessName}`;
    const heading = `Congratulations ${escapeHtml(clientName)}!`;
    const bodyHtml = `
      <div class="message">Your wedding booking <strong>#${escapeHtml(bookingNumber)}</strong> has been confirmed.</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Booking Reference:</span><span class="detail-value">#${escapeHtml(bookingNumber)}</span></div>
        <div class="detail-row"><span class="detail-label">Primary Event Date:</span><span class="detail-value">${escapeHtml(eventDate)}</span></div>
        <div class="detail-row"><span class="detail-label">Venue:</span><span class="detail-value">${escapeHtml(venue || 'Studio / TBD')}</span></div>
        <div class="detail-row"><span class="detail-label">Total Agreed Value:</span><span class="detail-value">₹${escapeHtml(totalAmount)}</span></div>
      </div>
      <div class="success-box">Our artistry team has reserved this date exclusively for you.</div>
    `;

    return {
      subject: `Wedding Booking Confirmed #${bookingNumber} - ${businessName}`,
      html: baseLayout({ title, heading, bodyHtml, businessName }),
      text: `Congratulations ${clientName}!\n\nYour booking #${bookingNumber} has been confirmed for ${eventDate}.\nTotal Amount: ₹${totalAmount}\nVenue: ${venue || 'TBD'}\n\n— ${businessName}`,
    };
  },

  /**
   * Payment Receipt / Notification for Customer
   */
  paymentReceiptCustomer({
    clientName,
    receiptNumber,
    amountFormatted,
    method,
    transactionReference,
    paymentDate,
    bookingNumber,
    totalBookingAmount,
    balanceRemaining,
    businessName = 'Bridal Studio',
    studioPhone,
    studioEmail,
  }) {
    const title = `Payment Receipt #${receiptNumber} - ${businessName}`;
    const heading = `Payment Received`;
    const bodyHtml = `
      <div class="message">Dear <strong>${escapeHtml(clientName)}</strong>, thank you for your payment. We have recorded your payment for booking <strong>#${escapeHtml(bookingNumber)}</strong>.</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Receipt Number:</span><span class="detail-value">${escapeHtml(receiptNumber)}</span></div>
        <div class="detail-row"><span class="detail-label">Amount Paid:</span><span class="detail-value" style="color: #16a34a; font-size: 14px;">${escapeHtml(amountFormatted)}</span></div>
        <div class="detail-row"><span class="detail-label">Payment Mode:</span><span class="detail-value">${escapeHtml(method)}</span></div>
        ${paymentDate ? `<div class="detail-row"><span class="detail-label">Payment Date:</span><span class="detail-value">${escapeHtml(paymentDate)}</span></div>` : ''}
        ${transactionReference ? `<div class="detail-row"><span class="detail-label">Ref / Transaction ID:</span><span class="detail-value">${escapeHtml(transactionReference)}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">Booking Reference:</span><span class="detail-value">#${escapeHtml(bookingNumber)}</span></div>
        ${totalBookingAmount ? `<div class="detail-row"><span class="detail-label">Total Booking Value:</span><span class="detail-value">₹${escapeHtml(totalBookingAmount)}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">Remaining Balance:</span><span class="detail-value" style="color: ${Number(balanceRemaining) > 0 ? '#ea580c' : '#16a34a'};">₹${escapeHtml(balanceRemaining || '0.00')}</span></div>
      </div>
      <div class="success-box">Your payment has been reconciled. Keep this receipt for your records.</div>
      ${studioPhone || studioEmail ? `<div class="message" style="margin-top: 15px; font-size: 13px;">For any billing questions, reach us at ${escapeHtml(studioPhone || studioEmail)}.</div>` : ''}
    `;

    return {
      subject: `Payment Receipt #${receiptNumber} (${amountFormatted}) - ${businessName}`,
      html: baseLayout({ title, heading, bodyHtml, businessName }),
      text: `Payment Receipt #${receiptNumber}\nAmount: ${amountFormatted} via ${method}\nDate: ${paymentDate || 'Today'}\nBooking: #${bookingNumber}\nRemaining Balance: ₹${balanceRemaining || '0.00'}\n\n— ${businessName}`,
    };
  },

  /**
   * Payment Notification for Admin
   */
  paymentReceivedAdmin({
    clientName,
    receiptNumber,
    amountFormatted,
    method,
    transactionReference,
    bookingNumber,
    balanceRemaining,
    dashboardUrl,
    businessName = 'Bridal Studio',
  }) {
    const title = `Payment Recorded: ${amountFormatted} from ${clientName}`;
    const heading = `Payment Recorded`;
    const bodyHtml = `
      <div class="message">A manual payment of <strong>${escapeHtml(amountFormatted)}</strong> has been recorded for booking <strong>#${escapeHtml(bookingNumber)}</strong>.</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Client Name:</span><span class="detail-value">${escapeHtml(clientName)}</span></div>
        <div class="detail-row"><span class="detail-label">Receipt Number:</span><span class="detail-value">${escapeHtml(receiptNumber)}</span></div>
        <div class="detail-row"><span class="detail-label">Amount:</span><span class="detail-value">${escapeHtml(amountFormatted)}</span></div>
        <div class="detail-row"><span class="detail-label">Payment Method:</span><span class="detail-value">${escapeHtml(method)}</span></div>
        ${transactionReference ? `<div class="detail-row"><span class="detail-label">Reference Note:</span><span class="detail-value">${escapeHtml(transactionReference)}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">Updated Balance Due:</span><span class="detail-value">₹${escapeHtml(balanceRemaining || '0.00')}</span></div>
      </div>
      ${dashboardUrl ? `<div style="text-align: center; margin: 15px 0;"><a href="${escapeHtml(dashboardUrl)}" target="_blank" style="display: inline-block; background: #ea580c; color: #ffffff; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px;">View Booking in Dashboard</a></div>` : ''}
      <div class="cta-admin-box">
        <div class="cta-admin-title">Studio Admin Portal</div>
        <a href="${escapeHtml(APP_CONFIG.getAdminLoginUrl())}" target="_blank" class="cta-btn">
          Login to VARNAM Dashboard &rarr;
        </a>
      </div>
    `;

    return {
      subject: `💰 Payment Recorded: ${amountFormatted} - ${clientName} (#${bookingNumber})`,
      html: baseLayout({ title, heading, bodyHtml, businessName }),
      text: `Payment recorded for ${clientName}: ${amountFormatted} via ${method}. Receipt: #${receiptNumber}. Remaining balance: ₹${balanceRemaining || '0.00'}.\n\nLogin to VARNAM Dashboard: ${APP_CONFIG.getAdminLoginUrl()}`,
    };
  },

  /**
   * Legacy alias for backward compatibility
   */
  paymentRecorded(params) {
    return this.paymentReceiptCustomer(params);
  },

  /**
   * New Website Enquiry Alert (For Artist / Studio Owner)
   */
  websiteEnquiryAlert({
    customerName,
    customerPhone,
    customerEmail,
    requestedService,
    eventType,
    eventDate,
    submittedTime,
    message,
    dashboardUrl,
    businessName = 'Bridal Studio',
  }) {
    const title = `New Lead: ${customerName}`;
    const heading = `New Enquiry Received!`;
    const bodyHtml = `
      <div class="message">A new enquiry has been submitted for <strong>${escapeHtml(businessName)}</strong>:</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Customer Name:</span><span class="detail-value">${escapeHtml(customerName)}</span></div>
        <div class="detail-row"><span class="detail-label">Phone:</span><span class="detail-value">${escapeHtml(customerPhone)}</span></div>
        <div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${escapeHtml(customerEmail || 'Not provided')}</span></div>
        ${requestedService ? `<div class="detail-row"><span class="detail-label">Requested Package / Service:</span><span class="detail-value">${escapeHtml(requestedService)}</span></div>` : ''}
        ${eventType ? `<div class="detail-row"><span class="detail-label">Event Type:</span><span class="detail-value">${escapeHtml(eventType)}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">Event Date:</span><span class="detail-value">${escapeHtml(eventDate || 'Flexible / TBD')}</span></div>
        ${submittedTime ? `<div class="detail-row"><span class="detail-label">Submission Time:</span><span class="detail-value">${escapeHtml(submittedTime)}</span></div>` : ''}
        ${message ? `<div class="detail-row"><span class="detail-label">Message / Notes:</span><span class="detail-value">${escapeHtml(message)}</span></div>` : ''}
      </div>
      ${dashboardUrl ? `<div style="text-align: center; margin: 18px 0;"><a href="${escapeHtml(dashboardUrl)}" target="_blank" style="display: inline-block; background: #ea580c; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px;">Open Enquiry in CRM Dashboard &rarr;</a></div>` : ''}
      <div class="cta-admin-box">
        <div class="cta-admin-title">Studio Admin Portal</div>
        <a href="${escapeHtml(APP_CONFIG.getAdminLoginUrl())}" target="_blank" class="cta-btn">
          Login to VARNAM Dashboard &rarr;
        </a>
      </div>
      <div class="message">Please follow up promptly with the client.</div>
    `;

    return {
      subject: `⚡ New Enquiry: ${customerName} (${eventDate || 'New Lead'}) - ${businessName}`,
      html: baseLayout({ title, heading, bodyHtml, businessName }),
      text: `New Enquiry Received:\nName: ${customerName}\nPhone: ${customerPhone}\nEmail: ${customerEmail || 'N/A'}\nEvent Date: ${eventDate || 'TBD'}\nService: ${requestedService || 'N/A'}\n\nLogin to VARNAM Dashboard: ${APP_CONFIG.getAdminLoginUrl()}\n\n— ${businessName}`,
    };
  },

  /**
   * Low Stock Inventory Warning
   */
  lowStockAlert({ itemName, currentQuantity, minimumThreshold, inventoryUrl, businessName = 'Bridal Studio' }) {
    const title = `Inventory Alert - Low Stock: ${itemName}`;
    const heading = `Inventory Threshold Warning`;
    const bodyHtml = `
      <div class="message">The cosmetics inventory item <strong>${escapeHtml(itemName)}</strong> has reached or fallen below its restock threshold.</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Product Name:</span><span class="detail-value">${escapeHtml(itemName)}</span></div>
        <div class="detail-row"><span class="detail-label">Current Quantity:</span><span class="detail-value" style="color: #dc2626; font-weight: 700;">${escapeHtml(currentQuantity)}</span></div>
        <div class="detail-row"><span class="detail-label">Minimum Threshold:</span><span class="detail-value">${escapeHtml(minimumThreshold)}</span></div>
      </div>
      <div class="alert-box">Action Required: Please arrange restocking before upcoming bridal appointments to prevent stockouts.</div>
      ${inventoryUrl ? `<div style="text-align: center; margin: 18px 0;"><a href="${escapeHtml(inventoryUrl)}" target="_blank" style="display: inline-block; background: #ea580c; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px;">Open Inventory & Stock Restock &rarr;</a></div>` : ''}
      <div class="cta-admin-box">
        <div class="cta-admin-title">Studio Admin Portal</div>
        <a href="${escapeHtml(APP_CONFIG.getAdminLoginUrl())}" target="_blank" class="cta-btn">
          Login to VARNAM Dashboard &rarr;
        </a>
      </div>
    `;

    return {
      subject: `⚠️ Low Stock Warning: ${itemName} (${currentQuantity} left) - ${businessName}`,
      html: baseLayout({ title, heading, bodyHtml, businessName }),
      text: `Low Stock Warning for ${itemName}!\nCurrent Qty: ${currentQuantity}, Min Threshold: ${minimumThreshold}.\nPlease restock soon: ${inventoryUrl || ''}\n\nLogin to VARNAM Dashboard: ${APP_CONFIG.getAdminLoginUrl()}\n\n— ${businessName}`,
    };
  },

  /**
   * Customer Enquiry Acknowledgement
   */
  enquiryAcknowledgement({ customerName, enquiryNumber, requestedPackage, eventDate, businessName = 'Bridal Studio', studioPhone, studioEmail, studioAddress, mapUrl }) {
    const title = `Enquiry Received - ${businessName}`;
    const heading = `Hello ${escapeHtml(customerName)},`;
    const bodyHtml = `
      <div class="message">Thank you for considering <strong>${escapeHtml(businessName)}</strong> for your special occasion. We have received your enquiry and our team will get back to you shortly.</div>
      <div class="detail-box">
        ${enquiryNumber ? `<div class="detail-row"><span class="detail-label">Enquiry Reference:</span><span class="detail-value">#${escapeHtml(enquiryNumber)}</span></div>` : ''}
        ${requestedPackage ? `<div class="detail-row"><span class="detail-label">Service / Package:</span><span class="detail-value">${escapeHtml(requestedPackage)}</span></div>` : ''}
        ${eventDate ? `<div class="detail-row"><span class="detail-label">Event Date:</span><span class="detail-value">${escapeHtml(eventDate)}</span></div>` : ''}
        ${studioPhone ? `<div class="detail-row"><span class="detail-label">Studio Contact:</span><span class="detail-value">${escapeHtml(studioPhone)}</span></div>` : ''}
        ${studioEmail ? `<div class="detail-row"><span class="detail-label">Studio Email:</span><span class="detail-value">${escapeHtml(studioEmail)}</span></div>` : ''}
        ${studioAddress ? `<div class="detail-row"><span class="detail-label">Studio Location:</span><span class="detail-value">${escapeHtml(studioAddress)}</span></div>` : ''}
      </div>
      <div class="alert-box">
        <strong>Next Steps:</strong><br>
        1. Our bridal coordinator reviews our availability for your event date.<br>
        2. We will contact you via phone or WhatsApp to discuss your styling requirements, guest counts, and customize your quote.<br>
        3. You may schedule an in-studio trial and bridal consultation to finalize your booking.
      </div>
      ${mapUrl ? `<div style="text-align: center; margin: 20px 0;"><a href="${escapeHtml(mapUrl)}" target="_blank" style="display: inline-block; background: #ea580c; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px;">📍 View Studio Location on Google Maps</a></div>` : ''}
      <div class="success-box">We are dedicated to crafting your unforgettable bridal journey!</div>
    `;

    return {
      subject: `Thank you for your enquiry - ${businessName}`,
      html: baseLayout({ title, heading, bodyHtml, businessName }),
      text: `Hello ${customerName},\n\nThank you for reaching out to ${businessName}. We have received your enquiry for ${eventDate || 'your upcoming event'}.\n\nNext steps: Our coordinator will review date availability and contact you shortly.\nStudio Contact: ${studioPhone || studioEmail || ''}\nLocation: ${studioAddress || ''}\n\n— ${businessName}`,
    };
  },

  /**
   * Enquiry Automated Follow-Up (24h, 3d, 7d)
   */
  enquiryFollowUp({ customerName, stepNumber, requestedPackage, eventDate, businessName = 'Bridal Studio', studioPhone, studioEmail }) {
    const titles = {
      1: `Following up on your Bridal Enquiry - ${businessName}`,
      2: `Checking in on your wedding styling - ${businessName}`,
      3: `Exclusive Bridal Dates Filling Fast - ${businessName}`,
    };
    const title = titles[stepNumber] || `Bridal Consultation Follow-up - ${businessName}`;
    const heading = `Dear ${escapeHtml(customerName)},`;
    
    let followUpText = `We wanted to check in regarding your enquiry for ${escapeHtml(requestedPackage || 'Bridal Services')} on ${escapeHtml(eventDate || 'your wedding date')}. Our calendar for upcoming wedding seasons fills up rapidly.`;
    if (stepNumber === 1) {
      followUpText = `Just following up on your recent enquiry with ${escapeHtml(businessName)}. Have you had a chance to review our packages or do you have any questions about customized bridal looks?`;
    } else if (stepNumber === 3) {
      followUpText = `Wedding dates are currently booking up fast. If you'd like to reserve your spot or schedule a trial consultation, please reach out so we can hold your date.`;
    }

    const bodyHtml = `
      <div class="message">${followUpText}</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Service / Package:</span><span class="detail-value">${escapeHtml(requestedPackage || 'Custom Bridal Artistry')}</span></div>
        ${eventDate ? `<div class="detail-row"><span class="detail-label">Target Date:</span><span class="detail-value">${escapeHtml(eventDate)}</span></div>` : ''}
        ${studioPhone ? `<div class="detail-row"><span class="detail-label">Phone:</span><span class="detail-value">${escapeHtml(studioPhone)}</span></div>` : ''}
      </div>
      <div class="alert-box">Feel free to reply to this email or call us directly at <strong>${escapeHtml(studioPhone || 'our studio')}</strong> to secure your booking.</div>
    `;

    return {
      subject: title,
      html: baseLayout({ title, heading, bodyHtml, businessName }),
      text: `Hello ${customerName},\n\n${followUpText}\n\nContact: ${studioPhone || studioEmail}\n— ${businessName}`,
    };
  },

  /**
   * Detailed Booking Confirmation (Customer)
   */
  bookingConfirmationCustomer({ clientName, bookingNumber, totalAmount, advancePaid, balanceDue, eventDate, eventTime, venue, preparationInstructions, businessName = 'Bridal Studio', studioPhone, studioAddress, mapUrl }) {
    const title = `Booking Confirmed #${bookingNumber} - ${businessName}`;
    const heading = `Congratulations ${escapeHtml(clientName)}!`;
    const bodyHtml = `
      <div class="message">Your wedding booking <strong>#${escapeHtml(bookingNumber)}</strong> has been confirmed with <strong>${escapeHtml(businessName)}</strong>. We are thrilled to be part of your celebrations!</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Booking Reference:</span><span class="detail-value">#${escapeHtml(bookingNumber)}</span></div>
        <div class="detail-row"><span class="detail-label">Event Date:</span><span class="detail-value">${escapeHtml(eventDate)}</span></div>
        ${eventTime ? `<div class="detail-row"><span class="detail-label">Event Time:</span><span class="detail-value">${escapeHtml(eventTime)}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">Venue / Location:</span><span class="detail-value">${escapeHtml(venue || studioAddress || 'Studio')}</span></div>
        <div class="detail-row"><span class="detail-label">Total Agreed Amount:</span><span class="detail-value">₹${escapeHtml(totalAmount)}</span></div>
        <div class="detail-row"><span class="detail-label">Advance Paid:</span><span class="detail-value">₹${escapeHtml(advancePaid || '0')}</span></div>
        <div class="detail-row"><span class="detail-label">Remaining Balance:</span><span class="detail-value">₹${escapeHtml(balanceDue || '0')}</span></div>
      </div>
      ${mapUrl ? `<div style="text-align: center; margin: 15px 0;"><a href="${escapeHtml(mapUrl)}" target="_blank" style="display: inline-block; background: #ea580c; color: #ffffff; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px;">📍 View Venue / Studio Map</a></div>` : ''}
      ${preparationInstructions ? `<div class="alert-box"><strong>Preparation Instructions:</strong><br>${escapeHtml(preparationInstructions)}</div>` : ''}
      <div class="success-box">Your dates have been locked in our official master schedule.</div>
    `;

    return {
      subject: `Wedding Booking Confirmed #${bookingNumber} - ${businessName}`,
      html: baseLayout({ title, heading, bodyHtml, businessName }),
      text: `Congratulations ${clientName}!\n\nBooking #${bookingNumber} is confirmed.\nDate: ${eventDate}\nVenue: ${venue || studioAddress || 'Studio'}\nTotal: ₹${totalAmount}\nAdvance Paid: ₹${advancePaid || '0'}\nRemaining: ₹${balanceDue || '0'}\n\n— ${businessName}`,
    };
  },

  /**
   * Booking Notification (Admin)
   */
  bookingConfirmationAdmin({ clientName, bookingNumber, totalAmount, paymentStatus, eventDate, dashboardUrl, businessName = 'Bridal Studio' }) {
    const title = `New Confirmed Booking #${bookingNumber}`;
    const heading = `New Booking Confirmed`;
    const bodyHtml = `
      <div class="message">A new booking <strong>#${escapeHtml(bookingNumber)}</strong> has been confirmed for <strong>${escapeHtml(clientName)}</strong>.</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Client Name:</span><span class="detail-value">${escapeHtml(clientName)}</span></div>
        <div class="detail-row"><span class="detail-label">Event Date:</span><span class="detail-value">${escapeHtml(eventDate)}</span></div>
        <div class="detail-row"><span class="detail-label">Total Amount:</span><span class="detail-value">₹${escapeHtml(totalAmount)}</span></div>
        <div class="detail-row"><span class="detail-label">Payment Status:</span><span class="detail-value">${escapeHtml(paymentStatus)}</span></div>
      </div>
      ${dashboardUrl ? `<div style="text-align: center; margin: 20px 0;"><a href="${escapeHtml(dashboardUrl)}" target="_blank" style="display: inline-block; background: #ea580c; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px;">View Booking in Dashboard</a></div>` : ''}
      <div class="cta-admin-box">
        <div class="cta-admin-title">Studio Admin Portal</div>
        <a href="${escapeHtml(APP_CONFIG.getAdminLoginUrl())}" target="_blank" class="cta-btn">
          Login to VARNAM Dashboard &rarr;
        </a>
      </div>
    `;

    return {
      subject: `🎉 Booking Confirmed #${bookingNumber} - ${clientName} (${eventDate})`,
      html: baseLayout({ title, heading, bodyHtml, businessName }),
      text: `New Booking #${bookingNumber} confirmed for ${clientName} on ${eventDate}. Total: ₹${totalAmount}. Status: ${paymentStatus}.\n\nLogin to VARNAM Dashboard: ${APP_CONFIG.getAdminLoginUrl()}`,
    };
  },

  /**
   * Outstanding Balance Payment Reminder
   */
  balancePaymentReminder({ clientName, bookingNumber, balanceAmount, dueDate, isOverdue = false, businessName = 'Bridal Studio', studioPhone }) {
    const title = isOverdue ? `Overdue Balance Notice - #${bookingNumber}` : `Balance Payment Reminder - #${bookingNumber}`;
    const heading = `Payment Reminder: Booking #${escapeHtml(bookingNumber)}`;
    const bodyHtml = `
      <div class="message">Hello ${escapeHtml(clientName)}, this is a friendly reminder regarding the outstanding balance for your bridal booking with <strong>${escapeHtml(businessName)}</strong>.</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Booking Reference:</span><span class="detail-value">#${escapeHtml(bookingNumber)}</span></div>
        <div class="detail-row"><span class="detail-label">Outstanding Balance:</span><span class="detail-value" style="color: #dc2626;">₹${escapeHtml(balanceAmount)}</span></div>
        <div class="detail-row"><span class="detail-label">Balance Due Date:</span><span class="detail-value">${escapeHtml(dueDate || 'Prior to event')}</span></div>
      </div>
      <div class="${isOverdue ? 'alert-box' : 'success-box'}">
        ${isOverdue ? 'Your balance payment is currently overdue. Please contact our studio immediately to clear the balance.' : 'Kindly arrange the balance payment as per your booking schedule to avoid any last-minute delays.'}
      </div>
      ${studioPhone ? `<div class="message" style="margin-top: 15px;">For inquiries or assistance with payment modes, reach us at <strong>${escapeHtml(studioPhone)}</strong>.</div>` : ''}
    `;

    return {
      subject: `${isOverdue ? '⚠️ Overdue' : 'Reminder'}: Outstanding Balance for Booking #${bookingNumber} - ${businessName}`,
      html: baseLayout({ title, heading, bodyHtml, businessName }),
      text: `Hello ${clientName},\n\nReminder: Outstanding balance of ₹${balanceAmount} for booking #${bookingNumber} is due on ${dueDate || 'prior to event'}.\n\n— ${businessName}`,
    };
  },

  /**
   * 2-Day Event Preparation Reminder (Customer)
   */
  eventPreparationCustomer({ clientName, eventTitle, eventDate, eventTime, venue, preparationInstructions, businessName = 'Bridal Studio', studioPhone, mapUrl }) {
    const title = `2 Days To Your Big Day! Preparation Details`;
    const heading = `Almost Time, ${escapeHtml(clientName)}!`;
    const bodyHtml = `
      <div class="message">Your wedding event <strong>${escapeHtml(eventTitle || 'Bridal Makeup')}</strong> is exactly 2 days away! Here are important details to ensure seamless styling:</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Event Date:</span><span class="detail-value">${escapeHtml(eventDate)}</span></div>
        ${eventTime ? `<div class="detail-row"><span class="detail-label">Call Time:</span><span class="detail-value">${escapeHtml(eventTime)}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">Venue:</span><span class="detail-value">${escapeHtml(venue || 'Studio')}</span></div>
      </div>
      ${preparationInstructions ? `
        <div class="alert-box">
          <strong>Preparation Checklist:</strong><br>
          ${escapeHtml(preparationInstructions)}
        </div>
      ` : `
        <div class="alert-box">
          <strong>Essential Bridal Tips:</strong><br>
          • Ensure clean, moisturized skin and dry hair on arrival.<br>
          • Wear a front-open buttoned shirt or robe.<br>
          • Keep bridal jewelry and outfit easily accessible.
        </div>
      `}
      ${mapUrl ? `<div style="text-align: center; margin: 15px 0;"><a href="${escapeHtml(mapUrl)}" target="_blank" style="display: inline-block; background: #ea580c; color: #ffffff; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px;">📍 View Venue Directions</a></div>` : ''}
      <div class="success-box">Our artistry team is excited to make you look radiant! For any urgent changes, call ${escapeHtml(studioPhone || 'us')}.</div>
    `;

    return {
      subject: `✨ 2 Days to Your Wedding Event: ${eventTitle} - ${businessName}`,
      html: baseLayout({ title, heading, bodyHtml, businessName }),
      text: `Hello ${clientName},\n\nYour event ${eventTitle} is 2 days away (${eventDate} at ${eventTime || 'scheduled time'}).\nVenue: ${venue || 'Studio'}\n\n— ${businessName}`,
    };
  },

  /**
   * 2-Day Event Preparation Reminder (Admin/Artist)
   */
  eventPreparationAdmin({ clientName, eventTitle, eventDate, eventTime, venue, balanceDue, dashboardUrl, businessName = 'Bridal Studio' }) {
    const title = `Event in 2 Days: ${clientName}`;
    const heading = `Upcoming Event in 48 Hours`;
    const bodyHtml = `
      <div class="message">Upcoming bridal event scheduled in 2 days. Please ensure makeup kit, vanity lighting, and accessories are prepped:</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Client:</span><span class="detail-value">${escapeHtml(clientName)}</span></div>
        <div class="detail-row"><span class="detail-label">Event:</span><span class="detail-value">${escapeHtml(eventTitle)}</span></div>
        <div class="detail-row"><span class="detail-label">Date & Time:</span><span class="detail-value">${escapeHtml(eventDate)} at ${escapeHtml(eventTime || 'Scheduled Time')}</span></div>
        <div class="detail-row"><span class="detail-label">Venue:</span><span class="detail-value">${escapeHtml(venue || 'Studio')}</span></div>
        <div class="detail-row"><span class="detail-label">Balance Due:</span><span class="detail-value">₹${escapeHtml(balanceDue || '0')}</span></div>
      </div>
      ${dashboardUrl ? `<div style="text-align: center; margin: 15px 0;"><a href="${escapeHtml(dashboardUrl)}" target="_blank" style="display: inline-block; background: #ea580c; color: #ffffff; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px;">Open Booking Details</a></div>` : ''}
      <div class="cta-admin-box">
        <div class="cta-admin-title">Studio Admin Portal</div>
        <a href="${escapeHtml(APP_CONFIG.getAdminLoginUrl())}" target="_blank" class="cta-btn">
          Login to VARNAM Dashboard &rarr;
        </a>
      </div>
    `;

    return {
      subject: `🗓️ 48-Hour Alert: ${clientName} - ${eventTitle} (${eventDate})`,
      html: baseLayout({ title, heading, bodyHtml, businessName }),
      text: `Upcoming event in 2 days for ${clientName} on ${eventDate} at ${venue || 'Studio'}. Outstanding balance: ₹${balanceDue || '0'}.\n\nLogin to VARNAM Dashboard: ${APP_CONFIG.getAdminLoginUrl()}`,
    };
  },

  /**
   * Upcoming Booking Alert for Studio Admin
   */
  upcomingBookingAlertAdmin({ clientName, bookingNumber, eventDate, eventTime, packageName, status, balanceDue, dashboardUrl, businessName = 'Bridal Studio' }) {
    const title = `Upcoming Booking Alert: ${clientName}`;
    const heading = `Upcoming Confirmed Booking Alert`;
    const bodyHtml = `
      <div class="message">Reminder of an upcoming confirmed booking for <strong>${escapeHtml(businessName)}</strong>:</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Customer Name:</span><span class="detail-value">${escapeHtml(clientName)}</span></div>
        <div class="detail-row"><span class="detail-label">Booking Reference:</span><span class="detail-value">#${escapeHtml(bookingNumber)}</span></div>
        <div class="detail-row"><span class="detail-label">Event Date & Time:</span><span class="detail-value">${escapeHtml(eventDate)} ${eventTime ? `at ${escapeHtml(eventTime)}` : ''}</span></div>
        <div class="detail-row"><span class="detail-label">Service / Package:</span><span class="detail-value">${escapeHtml(packageName || 'Bridal Services')}</span></div>
        <div class="detail-row"><span class="detail-label">Booking Status:</span><span class="detail-value">${escapeHtml(status)}</span></div>
        <div class="detail-row"><span class="detail-label">Outstanding Balance:</span><span class="detail-value" style="color: ${Number(balanceDue) > 0 ? '#ea580c' : '#16a34a'};">₹${escapeHtml(balanceDue || '0.00')}</span></div>
      </div>
      ${dashboardUrl ? `<div style="text-align: center; margin: 15px 0;"><a href="${escapeHtml(dashboardUrl)}" target="_blank" style="display: inline-block; background: #ea580c; color: #ffffff; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px;">View in Booking Manager</a></div>` : ''}
      <div class="cta-admin-box">
        <div class="cta-admin-title">Studio Admin Portal</div>
        <a href="${escapeHtml(APP_CONFIG.getAdminLoginUrl())}" target="_blank" class="cta-btn">
          Login to VARNAM Dashboard &rarr;
        </a>
      </div>
    `;

    return {
      subject: `🔔 Upcoming Booking: ${clientName} (#${bookingNumber}) - ${eventDate}`,
      html: baseLayout({ title, heading, bodyHtml, businessName }),
      text: `Upcoming Booking Alert: ${clientName} (#${bookingNumber}) on ${eventDate}. Service: ${packageName}. Status: ${status}. Balance Due: ₹${balanceDue || '0.00'}.\n\nLogin to VARNAM Dashboard: ${APP_CONFIG.getAdminLoginUrl()}`,
    };
  },

  /**
   * Subscription Reminders & Notifications
   */
  subscriptionReminder({ studioOwnerName, businessName = 'Bridal Studio', eventType, planName, expiryDate, billingAmount, actionUrl }) {
    const subjects = {
      UPCOMING_RENEWAL: `Subscription Renewal Notice - ${planName} Plan`,
      UPCOMING_EXPIRY: `Important: Your ${planName} Subscription Expires Soon`,
      PAYMENT_FAILED: `Action Required: Subscription Payment Failed for ${businessName}`,
      PAYMENT_SUCCESS: `Subscription Renewed Successfully - ${planName}`,
      CANCELLED: `Subscription Cancellation Confirmation - ${businessName}`,
    };

    const subject = subjects[eventType] || `Subscription Status Update - ${businessName}`;
    const heading = `Subscription Notice`;

    let detailsHtml = '';
    if (eventType === 'UPCOMING_RENEWAL') {
      detailsHtml = `Your subscription for the <strong>${escapeHtml(planName)}</strong> tier will renew on <strong>${escapeHtml(expiryDate)}</strong> for ₹${escapeHtml(billingAmount)}.`;
    } else if (eventType === 'UPCOMING_EXPIRY') {
      detailsHtml = `Your studio subscription will expire on <strong>${escapeHtml(expiryDate)}</strong>. Renew now to avoid interruption to your client appointments and website.`;
    } else if (eventType === 'PAYMENT_FAILED') {
      detailsHtml = `We were unable to process the renewal payment for your <strong>${escapeHtml(planName)}</strong> plan. Please update your billing details to maintain uninterrupted service.`;
    } else if (eventType === 'PAYMENT_SUCCESS') {
      detailsHtml = `Thank you! Your renewal payment of ₹${escapeHtml(billingAmount)} for the <strong>${escapeHtml(planName)}</strong> plan has been processed successfully. Active through ${escapeHtml(expiryDate)}.`;
    } else {
      detailsHtml = `Your subscription for ${escapeHtml(businessName)} has been cancelled as requested.`;
    }

    const bodyHtml = `
      <div class="message">Hello ${escapeHtml(studioOwnerName || 'Studio Owner')},</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Studio:</span><span class="detail-value">${escapeHtml(businessName)}</span></div>
        <div class="detail-row"><span class="detail-label">Plan:</span><span class="detail-value">${escapeHtml(planName)}</span></div>
        ${expiryDate ? `<div class="detail-row"><span class="detail-label">Renewal / Expiry Date:</span><span class="detail-value">${escapeHtml(expiryDate)}</span></div>` : ''}
        ${billingAmount ? `<div class="detail-row"><span class="detail-label">Amount:</span><span class="detail-value">₹${escapeHtml(billingAmount)}</span></div>` : ''}
      </div>
      <div class="${eventType === 'PAYMENT_FAILED' ? 'alert-box' : 'success-box'}">${detailsHtml}</div>
      ${actionUrl ? `<div style="text-align: center; margin: 20px 0;"><a href="${escapeHtml(actionUrl)}" target="_blank" style="display: inline-block; background: #fff; color: #ea580c; border: 2px solid #ea580c; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 13px;">Manage Subscription</a></div>` : ''}
      <div class="cta-admin-box">
        <div class="cta-admin-title">Studio Admin Portal</div>
        <a href="${escapeHtml(APP_CONFIG.getAdminLoginUrl())}" target="_blank" class="cta-btn">
          Login to VARNAM Dashboard &rarr;
        </a>
      </div>
    `;

    return {
      subject,
      html: baseLayout({ title: subject, heading, bodyHtml, businessName }),
      text: `Hello ${studioOwnerName},\n\n${detailsHtml}\n\nLogin to VARNAM Dashboard: ${APP_CONFIG.getAdminLoginUrl()}\n\n— Varnam Bridal SaaS Support`,
    };
  },

  /**
   * Marketing Campaign Email with responsive styling and unsubscribe footer
   */
  campaignEmail({ businessName = 'Bridal Studio', campaignHeading, offerDescription, bannerImageUrl, ctaText, ctaUrl, unsubscribeUrl, studioPhone, studioEmail, studioAddress }) {
    const title = campaignHeading || `Special Offer from ${businessName}`;
    const heading = escapeHtml(campaignHeading || `Exclusive Update from ${businessName}`);
    const bodyHtml = `
      ${bannerImageUrl ? `<div style="margin: -10px -28px 20px -28px; text-align: center;"><img src="${escapeHtml(bannerImageUrl)}" alt="Campaign Banner" style="max-width: 100%; height: auto; display: block; border-radius: 0;" /></div>` : ''}
      <div class="message" style="font-size: 15px; line-height: 1.7; white-space: pre-wrap;">${escapeHtml(offerDescription || '')}</div>
      ${ctaText && ctaUrl ? `
        <div style="text-align: center; margin: 30px 0 20px 0;">
          <a href="${escapeHtml(ctaUrl)}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #ea580c 0%, #f97316 100%); color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; box-shadow: 0 4px 12px rgba(234, 88, 12, 0.35);">
            ${escapeHtml(ctaText)} &rarr;
          </a>
        </div>
      ` : ''}
      <div class="detail-box" style="margin-top: 25px;">
        <div style="font-weight: 700; color: #9a3412; font-size: 13px; margin-bottom: 6px;">Contact ${escapeHtml(businessName)}</div>
        ${studioPhone ? `<div class="detail-row"><span class="detail-label">Phone:</span><span class="detail-value">${escapeHtml(studioPhone)}</span></div>` : ''}
        ${studioEmail ? `<div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${escapeHtml(studioEmail)}</span></div>` : ''}
        ${studioAddress ? `<div class="detail-row"><span class="detail-label">Address:</span><span class="detail-value">${escapeHtml(studioAddress)}</span></div>` : ''}
      </div>
      <div style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 30px; line-height: 1.5;">
        You received this promotional message because you previously interacted with or booked services at ${escapeHtml(businessName)}.<br>
        ${unsubscribeUrl ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color: #ea580c; text-decoration: underline;">Unsubscribe from marketing emails</a>` : 'To unsubscribe, reply with "UNSUBSCRIBE"'}
      </div>
    `;

    return {
      subject: title,
      html: baseLayout({ title, heading, bodyHtml, businessName }),
      text: `${campaignHeading}\n\n${offerDescription}\n\n${ctaText ? `${ctaText}: ${ctaUrl}` : ''}\n\nContact: ${studioPhone || studioEmail}\nUnsubscribe: ${unsubscribeUrl || 'Reply to unsubscribe'}`,
    };
  },

  /**
   * 1. Consultation Reschedule Email – Customer
   */
  consultationRescheduledCustomer({
    clientName,
    studioName,
    logoUrl,
    consultationRef,
    previousDateStr,
    previousTimeStr,
    updatedDateStr,
    updatedTimeStr,
    location,
    studioPhone,
    studioEmail,
  }) {
    const title = `Your Consultation Has Been Rescheduled – ${studioName}`;
    const heading = `Hello ${escapeHtml(clientName)},`;
    const bodyHtml = `
      <div class="message">Your bridal consultation with <strong>${escapeHtml(studioName)}</strong> has been successfully rescheduled. Please review the updated appointment details below:</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Client Name:</span><span class="detail-value">${escapeHtml(clientName)}</span></div>
        <div class="detail-row"><span class="detail-label">Consultation Ref:</span><span class="detail-value">#${escapeHtml(consultationRef)}</span></div>
        <div class="detail-row"><span class="detail-label">Previous Date & Time:</span><span class="detail-value" style="color: #64748b; text-decoration: line-through;">${escapeHtml(previousDateStr)} at ${escapeHtml(previousTimeStr)}</span></div>
        <div class="detail-row"><span class="detail-label">Updated Date:</span><span class="detail-value" style="color: #ea580c;">${escapeHtml(updatedDateStr)}</span></div>
        <div class="detail-row"><span class="detail-label">Updated Time:</span><span class="detail-value" style="color: #ea580c;">${escapeHtml(updatedTimeStr)}</span></div>
        <div class="detail-row"><span class="detail-label">Studio Location:</span><span class="detail-value">${escapeHtml(location || 'Studio (In-Person)')}</span></div>
      </div>
      <div class="success-box">
        <strong>Rescheduling Confirmed:</strong> Your appointment slot is securely locked in our studio calendar. If you need any further adjustments, please feel free to reach out to our team.
      </div>
      <div class="detail-box" style="margin-top: 20px;">
        <div style="font-weight: 700; color: #9a3412; font-size: 13px; margin-bottom: 6px;">Studio Contact Information</div>
        ${studioPhone ? `<div class="detail-row"><span class="detail-label">Phone:</span><span class="detail-value">${escapeHtml(studioPhone)}</span></div>` : ''}
        ${studioEmail ? `<div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${escapeHtml(studioEmail)}</span></div>` : ''}
      </div>
    `;

    return {
      subject: `Your Consultation Has Been Rescheduled – ${studioName}`,
      html: baseLayout({ title, heading, bodyHtml, businessName: studioName, logoUrl }),
      text: `Hello ${clientName},\n\nYour consultation with ${studioName} (#${consultationRef}) has been rescheduled.\n\nPrevious Date & Time: ${previousDateStr} at ${previousTimeStr}\nUpdated Date & Time: ${updatedDateStr} at ${updatedTimeStr}\nLocation: ${location || 'Studio'}\n\nContact: ${studioPhone || studioEmail}\n\n— ${studioName}`,
    };
  },

  /**
   * 2. Follow-Up Reminder Email – Admin
   */
  followUpReminderAdmin({
    customerName,
    customerPhone,
    customerEmail,
    referenceType, // 'Enquiry' or 'Consultation'
    referenceId,
    referenceNumber,
    followUpDateStr,
    previousInteractionNotes,
    followUpNotes,
    portalLink,
    studioName,
    logoUrl,
  }) {
    const title = `Follow-up Reminder – ${customerName}`;
    const heading = `Follow-Up Reminder`;
    const bodyHtml = `
      <div class="message">This is an automated reminder that a scheduled follow-up with bride/client <strong>${escapeHtml(customerName)}</strong> is due.</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Customer Name:</span><span class="detail-value">${escapeHtml(customerName)}</span></div>
        <div class="detail-row"><span class="detail-label">Phone:</span><span class="detail-value">${escapeHtml(customerPhone || 'N/A')}</span></div>
        <div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${escapeHtml(customerEmail || 'N/A')}</span></div>
        <div class="detail-row"><span class="detail-label">Record Type:</span><span class="detail-value">${escapeHtml(referenceType)} (#${escapeHtml(referenceNumber || referenceId)})</span></div>
        <div class="detail-row"><span class="detail-label">Follow-Up Due:</span><span class="detail-value" style="color: #ea580c;">${escapeHtml(followUpDateStr)}</span></div>
        ${previousInteractionNotes ? `<div class="detail-row"><span class="detail-label">Previous Interaction:</span><span class="detail-value">${escapeHtml(previousInteractionNotes)}</span></div>` : ''}
        ${followUpNotes ? `<div class="detail-row"><span class="detail-label">Follow-Up Objective / Notes:</span><span class="detail-value">${escapeHtml(followUpNotes)}</span></div>` : ''}
      </div>
      ${portalLink ? `
        <div style="text-align: center; margin: 20px 0 10px 0;">
          <a href="${escapeHtml(portalLink)}" target="_blank" style="display: inline-block; background: #fff; color: #ea580c; border: 2px solid #ea580c; padding: 10px 20px; border-radius: 8px; font-weight: 700; font-size: 13px; text-decoration: none;">View ${escapeHtml(referenceType)} Details &rarr;</a>
        </div>
      ` : ''}
      <div class="cta-admin-box">
        <div class="cta-admin-title">Studio Management Action Required</div>
        <a href="${escapeHtml(APP_CONFIG.getAdminLoginUrl())}" target="_blank" class="cta-btn">
          Login to VARNAM Dashboard &rarr;
        </a>
        <div style="font-size: 11px; color: #9a3412; margin-top: 10px;">
          Direct Access: <a href="${escapeHtml(APP_CONFIG.getAdminLoginUrl())}" style="color: #ea580c; font-weight: 600;">${escapeHtml(APP_CONFIG.getAdminLoginUrl())}</a>
        </div>
      </div>
    `;

    return {
      subject: `Follow-up Reminder – ${customerName}`,
      html: baseLayout({ title, heading, bodyHtml, businessName: studioName, logoUrl }),
      text: `Follow-up Reminder – ${customerName}\n\nRecord: ${referenceType} #${referenceNumber || referenceId}\nPhone: ${customerPhone || 'N/A'}\nEmail: ${customerEmail || 'N/A'}\nDue: ${followUpDateStr}\nNotes: ${followUpNotes || 'N/A'}\n${portalLink ? `Details: ${portalLink}\n` : ''}\nLogin to VARNAM Dashboard: ${APP_CONFIG.getAdminLoginUrl()}\n\n— ${studioName}`,
    };
  },

  /**
   * 3. Pending Balance Email – Customer (2 days after bridal event ends)
   */
  pendingBalancePostEventCustomer({
    clientName,
    studioName,
    logoUrl,
    bookingNumber,
    eventCompletionDateStr,
    totalBookingAmount,
    amountPaid,
    remainingBalance,
    paymentInstructions,
    studioPhone,
    studioEmail,
  }) {
    const title = `Payment Balance Reminder – ${studioName}`;
    const heading = `Dear ${escapeHtml(clientName)},`;
    const bodyHtml = `
      <div class="message">Thank you for letting <strong>${escapeHtml(studioName)}</strong> be part of your bridal celebrations! We hope your special day was truly memorable.</div>
      <div class="message">This is a friendly reminder regarding the outstanding balance for your bridal booking:</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Booking Reference:</span><span class="detail-value">#${escapeHtml(bookingNumber)}</span></div>
        <div class="detail-row"><span class="detail-label">Event Completion Date:</span><span class="detail-value">${escapeHtml(eventCompletionDateStr)}</span></div>
        <div class="detail-row"><span class="detail-label">Total Booking Amount:</span><span class="detail-value">₹${escapeHtml(totalBookingAmount)}</span></div>
        <div class="detail-row"><span class="detail-label">Amount Already Paid:</span><span class="detail-value" style="color: #16a34a;">₹${escapeHtml(amountPaid)}</span></div>
        <div class="detail-row"><span class="detail-label">Remaining Balance Due:</span><span class="detail-value" style="color: #dc2626; font-size: 15px;">₹${escapeHtml(remainingBalance)}</span></div>
      </div>
      <div class="alert-box">
        <strong>Payment Instructions:</strong><br>
        ${escapeHtml(paymentInstructions || 'Kindly remit the pending balance via UPI / Bank Transfer or contact our studio desk to clear your invoice.')}
      </div>
      <div class="detail-box" style="margin-top: 20px;">
        <div style="font-weight: 700; color: #9a3412; font-size: 13px; margin-bottom: 6px;">Studio Contact Details</div>
        ${studioPhone ? `<div class="detail-row"><span class="detail-label">Phone:</span><span class="detail-value">${escapeHtml(studioPhone)}</span></div>` : ''}
        ${studioEmail ? `<div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${escapeHtml(studioEmail)}</span></div>` : ''}
      </div>
    `;

    return {
      subject: `Payment Balance Reminder – ${studioName}`,
      html: baseLayout({ title, heading, bodyHtml, businessName: studioName, logoUrl }),
      text: `Dear ${clientName},\n\nPayment Balance Reminder from ${studioName} for Booking #${bookingNumber}.\n\nEvent Completion Date: ${eventCompletionDateStr}\nTotal Amount: ₹${totalBookingAmount}\nAmount Paid: ₹${amountPaid}\nRemaining Balance Due: ₹${remainingBalance}\n\nPayment Instructions: ${paymentInstructions || 'Please remit via UPI / Studio Desk'}\nContact: ${studioPhone || studioEmail}\n\n— ${studioName}`,
    };
  },

  /**
   * 4. Booking Cancellation Email – Customer
   */
  bookingCancellationCustomer({
    clientName,
    studioName,
    logoUrl,
    bookingNumber,
    originalEventDateStr,
    bookingAmount,
    amountPaid,
    cancellationDateStr,
    refundAmount,
    refundStatus,
    studioPhone,
    studioEmail,
  }) {
    const title = `Booking Cancellation Confirmation – ${studioName}`;
    const heading = `Hello ${escapeHtml(clientName)},`;
    const bodyHtml = `
      <div class="message">Your wedding booking <strong>#${escapeHtml(bookingNumber)}</strong> with <strong>${escapeHtml(studioName)}</strong> has been cancelled.</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Booking Reference:</span><span class="detail-value">#${escapeHtml(bookingNumber)}</span></div>
        <div class="detail-row"><span class="detail-label">Original Event Date:</span><span class="detail-value">${escapeHtml(originalEventDateStr)}</span></div>
        <div class="detail-row"><span class="detail-label">Total Booking Amount:</span><span class="detail-value">₹${escapeHtml(bookingAmount)}</span></div>
        <div class="detail-row"><span class="detail-label">Amount Paid:</span><span class="detail-value">₹${escapeHtml(amountPaid)}</span></div>
        <div class="detail-row"><span class="detail-label">Cancellation Date:</span><span class="detail-value">${escapeHtml(cancellationDateStr)}</span></div>
        ${refundAmount ? `<div class="detail-row"><span class="detail-label">Refund Amount:</span><span class="detail-value" style="color: #16a34a;">₹${escapeHtml(refundAmount)}</span></div>` : ''}
        ${refundStatus ? `<div class="detail-row"><span class="detail-label">Refund Status:</span><span class="detail-value">${escapeHtml(refundStatus)}</span></div>` : ''}
      </div>
      <div class="danger-box">
        <strong>Cancellation Recorded:</strong> Your booking is no longer active on our calendar.
        ${refundAmount ? ` Refund of ₹${escapeHtml(refundAmount)} has been logged (${escapeHtml(refundStatus || 'Processing')}).` : ''}
      </div>
      <div class="detail-box" style="margin-top: 20px;">
        <div style="font-weight: 700; color: #9a3412; font-size: 13px; margin-bottom: 6px;">Studio Inquiries</div>
        ${studioPhone ? `<div class="detail-row"><span class="detail-label">Phone:</span><span class="detail-value">${escapeHtml(studioPhone)}</span></div>` : ''}
        ${studioEmail ? `<div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${escapeHtml(studioEmail)}</span></div>` : ''}
      </div>
    `;

    return {
      subject: `Booking Cancellation Confirmation – ${studioName}`,
      html: baseLayout({ title, heading, bodyHtml, businessName: studioName, logoUrl }),
      text: `Hello ${clientName},\n\nYour booking #${bookingNumber} with ${studioName} has been cancelled.\n\nOriginal Event Date: ${originalEventDateStr}\nBooking Amount: ₹${bookingAmount}\nAmount Paid: ₹${amountPaid}\nCancellation Date: ${cancellationDateStr}\n${refundAmount ? `Refund Amount: ₹${refundAmount} (${refundStatus || 'Recorded'})\n` : ''}\nContact: ${studioPhone || studioEmail}\n\n— ${studioName}`,
    };
  },

  /**
   * 5. Subscription Expiry Email – Admin (3 days before studio subscription expires)
   */
  subscriptionExpiryAdmin({
    studioName,
    currentPlanName,
    subscriptionStartDateStr,
    subscriptionExpiryDateStr,
    daysRemaining = 3,
    renewalUrl,
  }) {
    const title = `Your VARNAM Subscription Expires in ${daysRemaining} Days – ${studioName}`;
    const heading = `Attention: Subscription Expiration Notice`;
    const bodyHtml = `
      <div class="message">Your studio subscription for <strong>${escapeHtml(studioName)}</strong> will expire in <strong>${escapeHtml(daysRemaining)} days</strong>.</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Studio Name:</span><span class="detail-value">${escapeHtml(studioName)}</span></div>
        <div class="detail-row"><span class="detail-label">Current Plan:</span><span class="detail-value" style="color: #ea580c;">${escapeHtml(currentPlanName)}</span></div>
        ${subscriptionStartDateStr ? `<div class="detail-row"><span class="detail-label">Start Date:</span><span class="detail-value">${escapeHtml(subscriptionStartDateStr)}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">Expiry Date:</span><span class="detail-value" style="color: #dc2626;">${escapeHtml(subscriptionExpiryDateStr)}</span></div>
        <div class="detail-row"><span class="detail-label">Days Remaining:</span><span class="detail-value" style="color: #ea580c; font-weight: 800;">${escapeHtml(daysRemaining)} days</span></div>
      </div>
      <div class="alert-box">
        <strong>Avoid Service Disruption:</strong> Renew your subscription before ${escapeHtml(subscriptionExpiryDateStr)} to retain continuous access to client bookings, automated WhatsApp messages, quotation generators, and bridal calendars.
      </div>
      ${renewalUrl ? `
        <div style="text-align: center; margin: 20px 0 10px 0;">
          <a href="${escapeHtml(renewalUrl)}" target="_blank" style="display: inline-block; background: #fff; color: #ea580c; border: 2px solid #ea580c; padding: 10px 20px; border-radius: 8px; font-weight: 700; font-size: 13px; text-decoration: none;">Direct Subscription Renewal &rarr;</a>
        </div>
      ` : ''}
      <div class="cta-admin-box">
        <div class="cta-admin-title">Studio Admin Portal</div>
        <a href="${escapeHtml(APP_CONFIG.getAdminLoginUrl())}" target="_blank" class="cta-btn">
          Login to VARNAM Dashboard &rarr;
        </a>
        <div style="font-size: 11px; color: #9a3412; margin-top: 10px;">
          Direct Access: <a href="${escapeHtml(APP_CONFIG.getAdminLoginUrl())}" style="color: #ea580c; font-weight: 600;">${escapeHtml(APP_CONFIG.getAdminLoginUrl())}</a>
        </div>
      </div>
    `;

    return {
      subject: `Your VARNAM Subscription Expires in ${daysRemaining} Days – ${studioName}`,
      html: baseLayout({ title, heading, bodyHtml, businessName: studioName }),
      text: `Subscription Expiry Notice for ${studioName}\n\nYour ${currentPlanName} plan expires in ${daysRemaining} days on ${subscriptionExpiryDateStr}.\nRenew now to prevent service interruption: ${renewalUrl || 'Visit Subscription Settings'}\n\nLogin to VARNAM Dashboard: ${APP_CONFIG.getAdminLoginUrl()}\n\n— VARNAM Bridal SaaS`,
    };
  },

  /**
   * 6. Refund Confirmation Email – Customer
   */
  refundConfirmationCustomer({
    clientName,
    studioName,
    logoUrl,
    bookingNumber,
    originalBookingAmount,
    totalAmountPaid,
    refundAmount,
    refundMethod,
    refundTransactionId,
    refundProcessedDateStr,
    refundStatus = 'REFUNDED',
    expectedProcessingTime = null,
    studioPhone,
    studioEmail,
  }) {
    const title = `Your Refund Has Been Processed – ${studioName}`;
    const heading = `Hello ${escapeHtml(clientName)},`;
    const bodyHtml = `
      <div class="message">A refund for your booking <strong>#${escapeHtml(bookingNumber)}</strong> with <strong>${escapeHtml(studioName)}</strong> has been successfully processed.</div>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Booking Reference:</span><span class="detail-value">#${escapeHtml(bookingNumber)}</span></div>
        <div class="detail-row"><span class="detail-label">Original Booking Value:</span><span class="detail-value">₹${escapeHtml(originalBookingAmount)}</span></div>
        <div class="detail-row"><span class="detail-label">Total Amount Paid:</span><span class="detail-value">₹${escapeHtml(totalAmountPaid)}</span></div>
        <div class="detail-row"><span class="detail-label">Actual Refund Amount:</span><span class="detail-value" style="color: #16a34a; font-size: 15px;">₹${escapeHtml(refundAmount)}</span></div>
        <div class="detail-row"><span class="detail-label">Refund Method:</span><span class="detail-value">${escapeHtml(refundMethod || 'Original Payment Method')}</span></div>
        ${refundTransactionId ? `<div class="detail-row"><span class="detail-label">Transaction / Ref ID:</span><span class="detail-value font-mono">${escapeHtml(refundTransactionId)}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">Processed Date:</span><span class="detail-value">${escapeHtml(refundProcessedDateStr)}</span></div>
        <div class="detail-row"><span class="detail-label">Current Status:</span><span class="detail-value" style="color: #16a34a;">${escapeHtml(refundStatus)}</span></div>
        ${expectedProcessingTime ? `<div class="detail-row"><span class="detail-label">Expected Processing Time:</span><span class="detail-value">${escapeHtml(expectedProcessingTime)}</span></div>` : ''}
      </div>
      <div class="success-box">
        <strong>Refund Recorded:</strong> The refund transaction of ₹${escapeHtml(refundAmount)} has been successfully confirmed in our records. Depending on your bank or payment gateway, please allow 3-5 business days for it to reflect in your account.
      </div>
      <div class="detail-box" style="margin-top: 20px;">
        <div style="font-weight: 700; color: #9a3412; font-size: 13px; margin-bottom: 6px;">Studio Contact Information</div>
        ${studioPhone ? `<div class="detail-row"><span class="detail-label">Phone:</span><span class="detail-value">${escapeHtml(studioPhone)}</span></div>` : ''}
        ${studioEmail ? `<div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${escapeHtml(studioEmail)}</span></div>` : ''}
      </div>
    `;

    return {
      subject: `Your Refund Has Been Processed – ${studioName}`,
      html: baseLayout({ title, heading, bodyHtml, businessName: studioName, logoUrl }),
      text: `Hello ${clientName},\n\nYour refund of ₹${refundAmount} for booking #${bookingNumber} has been processed by ${studioName}.\n\nMethod: ${refundMethod || 'UPI / Bank'}\nTransaction ID: ${refundTransactionId || 'N/A'}\nProcessed Date: ${refundProcessedDateStr}\nStatus: ${refundStatus}\n${expectedProcessingTime ? `Expected Time: ${expectedProcessingTime}\n` : ''}\nContact: ${studioPhone || studioEmail}\n\n— ${studioName}`,
    };
  },
};

