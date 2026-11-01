import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { validateRequest } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  registerSchema,
  verifyEmailSchema,
  resendOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordWithOtpSchema,
  studioUserLoginSchema,
} from '../validators/auth.validator.js';

import { authLimiter, otpLimiter } from '../middleware/rateLimiter.js';

const router = Router();

/**
 * Public Authentication Routes with Rate Limiting
 */
router.post('/register', authLimiter, validateRequest(registerSchema), authController.register);
router.post('/verify-email', authLimiter, validateRequest(verifyEmailSchema), authController.verifyEmail);
router.post('/resend-otp', otpLimiter, validateRequest(resendOtpSchema), authController.resendOtp);
router.post('/login', authLimiter, validateRequest(loginSchema), authController.login);
router.post('/studio-user/login', authLimiter, validateRequest(studioUserLoginSchema), authController.studioUserLogin);
router.get('/studio-info/:studioSlug', authController.getStudioPublicInfo);
router.post('/logout', authController.logout);
router.post('/forgot-password', otpLimiter, validateRequest(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', authLimiter, validateRequest(resetPasswordWithOtpSchema), authController.resetPassword);

/**
 * Protected Authentication Routes
 */
router.get('/me', authenticate, authController.getMe);

export default router;
