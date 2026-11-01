import nodemailer from 'nodemailer';
import { env } from './env.js';

/**
 * Configure Nodemailer SMTP transporter using credentials from .env
 */
export const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: Number(env.SMTP_PORT),
  secure: env.SMTP_SECURE, // true for port 465, false for other ports (587)
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
  tls: {
    // Prevent failure on local test environments while maintaining modern TLS
    rejectUnauthorized: env.NODE_ENV === 'production',
  },
});

/**
 * Verify transporter connection configuration
 */
export const verifyMailerConnection = async () => {
  if (!env.SMTP_PASS || !env.SMTP_USER) {
    console.warn('⚠️ SMTP credentials not fully configured in .env. Email delivery will fail.');
    return false;
  }
  try {
    await transporter.verify();
    console.log('✅ SMTP Mailer is ready to deliver messages.');
    return true;
  } catch (error) {
    console.warn('⚠️ SMTP Mailer connection verification warning:', error.message);
    return false;
  }
};
