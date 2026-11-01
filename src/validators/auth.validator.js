import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(180),
  email: z.string().trim().email('Invalid email address').max(254),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit'),
});

export const verifyEmailSchema = z.object({
  email: z.string().trim().email('Invalid email address').optional(),
  userId: z.string().uuid().optional(),
  otp: z
    .string()
    .trim()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^[0-9]+$/, 'OTP must be numeric'),
}).refine((data) => data.email || data.userId, {
  message: 'Email address or user ID is required',
  path: ['email'],
});

export const resendOtpSchema = z.object({
  email: z.string().trim().email('Invalid email address').optional(),
  userId: z.string().uuid().optional(),
}).refine((data) => data.email || data.userId, {
  message: 'Email address or user ID is required',
  path: ['email'],
});

export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const studioUserLoginSchema = z.object({
  studioSlug: z.string().trim().min(1, 'Studio identifier is required'),
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const createStudioUserSchema = z.object({
  name: z.string().trim().min(2, 'Full name must be at least 2 characters').max(180),
  email: z.string().trim().email('Invalid email address (Gmail/Email)').max(254),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  phone: z.string().trim().max(30).optional(),
});

export const resetStudioUserPasswordSchema = z.object({
  newPassword: z.string().min(6, 'New password must be at least 6 characters').max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').max(254),
});

export const resetPasswordWithOtpSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').max(254),
  otp: z
    .string()
    .trim()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^[0-9]+$/, 'OTP must be numeric'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit'),
});

