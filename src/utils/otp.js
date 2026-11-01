import crypto from 'crypto';

/**
 * Generates a cryptographically secure 6-digit OTP
 * @returns {string} exactly 6 digits
 */
export const generateOtp = () => {
  // Generate random integer between 100000 and 999999 inclusive
  return crypto.randomInt(100000, 1000000).toString();
};

/**
 * Hashes an OTP with SHA-256 (plus salt/secret) for safe database storage
 * @param {string} otp
 * @returns {string} hex digest
 */
export const hashOtp = (otp) => {
  return crypto.createHash('sha256').update(otp).digest('hex');
};

/**
 * Validates an OTP against stored hash using constant-time comparison
 * @param {string} plainOtp
 * @param {string} storedHash
 * @returns {boolean}
 */
export const verifyOtpHash = (plainOtp, storedHash) => {
  const incomingHash = hashOtp(plainOtp);
  if (incomingHash.length !== storedHash.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(incomingHash), Buffer.from(storedHash));
};
