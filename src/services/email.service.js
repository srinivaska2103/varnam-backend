import { transporter } from '../config/mailer.js';
import { env } from '../config/env.js';

/**
 * Service to send professional email notifications
 */
export const emailService = {
  /**
   * Send 6-digit OTP verification email
   * @param {object} params
   * @param {string} params.to
   * @param {string} params.name
   * @param {string} params.otp
   * @param {number} [params.expiryMinutes=10]
   */
  async sendVerificationOtp({ to, name, otp, expiryMinutes = 10 }) {
    const fromAddress = env.SMTP_FROM || `VEXA TECH <${env.SMTP_USER}>`;
    const recipientName = name ? name.trim() : 'Valued Partner';

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification - VEXA TECH</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #fffaf5; margin: 0; padding: 24px; color: #1e293b; }
        .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #fed7aa; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(249, 115, 22, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); }
        .header { background: linear-gradient(135deg, #ea580c 0%, #f97316 50%, #c2410c 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
        .brand { font-size: 22px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin: 0; text-shadow: 0 1px 2px rgba(0,0,0,0.15); }
        .tagline { font-size: 13px; color: #ffedd5; margin-top: 5px; font-weight: 500; letter-spacing: 0.5px; }
        .content { padding: 32px 28px; }
        .greeting { font-size: 17px; font-weight: 700; margin-bottom: 12px; color: #0f172a; }
        .message { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
        .otp-box { background: #fff7ed; border: 2px dashed #fdba74; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
        .otp-code { font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #ea580c; font-family: 'Courier New', Courier, monospace; margin: 0; }
        .expiry-note { font-size: 13px; color: #9a3412; margin-top: 8px; font-weight: 500; }
        .warning { background: #fff7ed; border-left: 4px solid #f97316; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #9a3412; line-height: 1.5; margin-top: 20px; }
        .footer { padding: 20px 28px; background: #fffaf5; border-top: 1px solid #fed7aa; text-align: center; font-size: 12px; color: #9a3412; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1 class="brand">VEXA TECH</h1>
          <div class="tagline">Bridal & Makeup Business Management Software</div>
        </div>
        <div class="content">
          <div class="greeting">Hello ${recipientName},</div>
          <div class="message">
            Thank you for registering with Bridal & Makeup Business Management Software. Please use the following One-Time Password (OTP) to verify your email address and activate your account.
          </div>
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <div class="expiry-note">This code will expire in ${expiryMinutes} minutes.</div>
          </div>
          <div class="warning">
            <strong>Security Notice:</strong> Never share this verification code with anyone. VEXA TECH representatives will never ask for your OTP. If you did not initiate this registration, please disregard this email.
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} VEXA TECH. All rights reserved.<br>
          Sent from noreply@vexatech.in
        </div>
      </div>
    </body>
    </html>
    `;

    const mailOptions = {
      from: fromAddress,
      to,
      subject: `${otp} is your VEXA TECH verification code`,
      html: htmlContent,
      text: `Hello ${recipientName},\n\nYour verification code is: ${otp}\n\nThis code will expire in ${expiryMinutes} minutes. If you did not initiate this request, please ignore this email.\n\n— VEXA TECH`,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Failed to send verification email via SMTP:', error.message);
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  },

  /**
   * Send 6-digit OTP for Password Reset
   * @param {object} params
   * @param {string} params.to
   * @param {string} params.name
   * @param {string} params.otp
   * @param {number} [params.expiryMinutes=10]
   */
  async sendPasswordResetOtp({ to, name, otp, expiryMinutes = 10 }) {
    const fromAddress = env.SMTP_FROM || `VEXA TECH <${env.SMTP_USER}>`;
    const recipientName = name ? name.trim() : 'Valued Partner';

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Password - VARNAM Bridal Studio</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #fffaf5; margin: 0; padding: 24px; color: #1e293b; }
        .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #fed7aa; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(249, 115, 22, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); }
        .header { background: linear-gradient(135deg, #ea580c 0%, #f97316 50%, #c2410c 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
        .brand { font-size: 22px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin: 0; text-shadow: 0 1px 2px rgba(0,0,0,0.15); }
        .tagline { font-size: 13px; color: #ffedd5; margin-top: 5px; font-weight: 500; letter-spacing: 0.5px; }
        .content { padding: 32px 28px; }
        .greeting { font-size: 17px; font-weight: 700; margin-bottom: 12px; color: #0f172a; }
        .message { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
        .otp-box { background: #fff7ed; border: 2px dashed #fdba74; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
        .otp-code { font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #ea580c; font-family: 'Courier New', Courier, monospace; margin: 0; }
        .expiry-note { font-size: 13px; color: #9a3412; margin-top: 8px; font-weight: 500; }
        .warning { background: #fff7ed; border-left: 4px solid #f97316; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #9a3412; line-height: 1.5; margin-top: 20px; }
        .footer { padding: 20px 28px; background: #fffaf5; border-top: 1px solid #fed7aa; text-align: center; font-size: 12px; color: #9a3412; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1 class="brand">VARNAM</h1>
          <div class="tagline">Bridal & Makeup Business SaaS - Password Reset</div>
        </div>
        <div class="content">
          <div class="greeting">Hello ${recipientName},</div>
          <div class="message">
            We received a request to reset your password for your VARNAM Bridal Studio account. Use the verification code below to authorize your password change.
          </div>
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <div class="expiry-note">This code is valid for ${expiryMinutes} minutes.</div>
          </div>
          <div class="warning">
            <strong>Security Notice:</strong> Never share this verification code with anyone. If you did not request a password reset, you can safely ignore this email—your account remains secure.
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} VEXA TECH. All rights reserved.<br>
          Sent from noreply@vexatech.in
        </div>
      </div>
    </body>
    </html>
    `;

    const mailOptions = {
      from: fromAddress,
      to,
      subject: `${otp} is your password reset code`,
      html: htmlContent,
      text: `Hello ${recipientName},\n\nYour password reset verification code is: ${otp}\n\nThis code will expire in ${expiryMinutes} minutes. If you did not request this, please ignore this email.\n\n— VARNAM Bridal Studio`,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Failed to send password reset email via SMTP:', error.message);
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  },

  /**
   * Notify Platform Admin when a user submits "Contact Sales"
   * @param {object} params
   * @param {string} params.adminEmail
   * @param {string} params.businessName
   * @param {string} params.contactName
   * @param {string} params.clientEmail
   * @param {string} params.clientPhone
   * @param {string} params.requirements
   * @param {string} params.planName
   */
  async sendSalesEnquiryNotificationToAdmin({
    adminEmail,
    businessName,
    contactName,
    clientEmail,
    clientPhone,
    requirements,
    planName = 'Premium — ₹29,999 (EXCLUSIVE_LIFETIME)',
  }) {
    const fromAddress = env.SMTP_FROM || `VEXA TECH <${env.SMTP_USER}>`;

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Premium Contact Sales Enquiry - VARNAM</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #fffaf5; margin: 0; padding: 24px; color: #1e293b; }
        .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #fed7aa; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(249, 115, 22, 0.1); }
        .header { background: linear-gradient(135deg, #ea580c 0%, #f97316 50%, #c2410c 100%); padding: 28px 24px; text-align: center; color: #ffffff; }
        .brand { font-size: 22px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin: 0; }
        .tagline { font-size: 13px; color: #ffedd5; margin-top: 5px; font-weight: 500; }
        .content { padding: 32px 28px; }
        .title { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
        .subtitle { font-size: 13px; color: #64748b; margin-bottom: 24px; }
        .lead-card { background: #fffaf5; border: 1px solid #fed7aa; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
        .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed #fed7aa; font-size: 13px; }
        .row:last-child { border-bottom: none; }
        .label { color: #9a3412; font-weight: 600; width: 38%; }
        .value { color: #1c1917; font-weight: 700; width: 62%; text-align: right; word-break: break-word; }
        .req-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; font-size: 13px; color: #334155; line-height: 1.6; margin-top: 16px; }
        .cta-box { text-align: center; margin-top: 24px; }
        .cta-btn { display: inline-block; background-color: #ea580c; color: #ffffff !important; font-size: 13px; font-weight: 700; padding: 12px 24px; border-radius: 8px; text-decoration: none; }
        .footer { padding: 18px 28px; background: #fffaf5; border-top: 1px solid #fed7aa; text-align: center; font-size: 11px; color: #9a3412; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1 class="brand">VARNAM &bull; SUPER ADMIN</h1>
          <div class="tagline">New Premium Enterprise Inbound Lead</div>
        </div>
        <div class="content">
          <div class="title">🚀 New "Contact Sales" Enquiry Received</div>
          <div class="subtitle">A studio owner just clicked Contact Sales and submitted their deployment details.</div>

          <div class="lead-card">
            <div class="row">
              <span class="label">Interested Plan:</span>
              <span class="value" style="color: #ea580c;">${planName}</span>
            </div>
            <div class="row">
              <span class="label">Studio / Business:</span>
              <span class="value">${businessName || 'N/A'}</span>
            </div>
            <div class="row">
              <span class="label">Contact Person:</span>
              <span class="value">${contactName}</span>
            </div>
            <div class="row">
              <span class="label">Phone Number:</span>
              <span class="value"><a href="tel:${clientPhone}" style="color: #ea580c; text-decoration: none;">${clientPhone}</a></span>
            </div>
            <div class="row">
              <span class="label">Email Address:</span>
              <span class="value"><a href="mailto:${clientEmail}" style="color: #ea580c; text-decoration: none;">${clientEmail}</a></span>
            </div>
          </div>

          <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Client Requirements / Notes:</div>
          <div class="req-box">
            ${requirements ? requirements.replace(/\n/g, '<br>') : 'No extra notes provided by studio.'}
          </div>

          <div class="cta-box">
            <a href="https://app.varnam.vexatech.in/login" class="cta-btn">Login to Dashboard &rarr;</a>
          </div>
        </div>
        <div class="footer">
          Varnam Super Admin Platform Telemetry &bull; Automated Sales Routing
        </div>
      </div>
    </body>
    </html>
    `;

    const mailOptions = {
      from: fromAddress,
      to: adminEmail,
      replyTo: clientEmail,
      subject: `🚨 New Contact Sales Lead: ${businessName || contactName} (Premium ₹29,999)`,
      html: htmlContent,
      text: `New Contact Sales Enquiry for Premium ₹29,999:\n\nStudio: ${businessName}\nContact: ${contactName}\nPhone: ${clientPhone}\nEmail: ${clientEmail}\nRequirements: ${requirements || 'N/A'}\n\nView at http://localhost:3001/enquiries`,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Contact Sales email alert dispatched to Super Admin (${adminEmail}): ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('⚠️ Could not send Contact Sales admin email alert:', error.message);
      return { success: false, error: error.message };
    }
  },
};

