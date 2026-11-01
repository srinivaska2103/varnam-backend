import { ApiError } from '../utils/apiResponse.js';

// In-memory sliding window rate limiter store
const memoryStore = new Map();

// Periodic cleanup of expired windows every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (now > record.resetTime) {
      memoryStore.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Express rate-limiting middleware factory
 * @param {object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 15 mins)
 * @param {number} options.max - Max requests per IP in the window (default: 100)
 * @param {string} options.message - Error message when rate limit exceeded
 * @param {string} [options.keyPrefix='rl'] - Key prefix to isolate limiters
 */
export const rateLimit = ({
  windowMs = 15 * 60 * 1000,
  max = 100,
  message = 'Too many requests from this IP, please try again later.',
  keyPrefix = 'rl',
} = {}) => {
  return (req, res, next) => {
    // In test environment, do not throttle automated test runners
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    let record = memoryStore.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      memoryStore.set(key, record);
    } else {
      record.count += 1;
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
      return next(new ApiError(429, message));
    }

    next();
  };
};

/**
 * Pre-configured rate limiters for security-sensitive surfaces:
 */

// Strict limiter for authentication endpoints: max 20 requests per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
  keyPrefix: 'auth',
});

// Sensitive OTP request limiter: max 5 requests per 10 minutes per IP
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: 'Too many OTP requests. Please wait 10 minutes before requesting a new code.',
  keyPrefix: 'otp',
});

// Public website enquiry spam limiter: max 15 submissions per hour per IP
export const publicFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: 'Too many form submissions received. Please wait an hour before submitting again.',
  keyPrefix: 'pubform',
});
