import Razorpay from 'razorpay';
import { env } from './env.js';

const keyId = env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || '';
const keySecret = env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || '';

/**
 * Singleton Razorpay SDK instance.
 * Initializes safely even if credentials are not yet entered (allows graceful degraded testing).
 */
export const razorpayClient = keyId && keySecret
  ? new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    })
  : null;

export const isRazorpayConfigured = () => Boolean(keyId && keySecret);

export const getRazorpayKeyId = () => keyId;

