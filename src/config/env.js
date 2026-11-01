import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z
    .string({ required_error: 'JWT_SECRET is required' })
    .min(32, 'JWT_SECRET must be at least 32 characters long for cryptographic security'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // SMTP Settings
  SMTP_HOST: z.string().optional().default('smtpout.secureserver.net'),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_SECURE: z
    .preprocess((val) => (val === 'true' || val === true ? true : false), z.boolean())
    .default(false),
  SMTP_USER: z.string().optional().default('noreply@vexatech.in'),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default('VEXA TECH <noreply@vexatech.in>'),
  FROM_EMAIL: z.string().optional().default('noreply@vexatech.in'),

  // Razorpay Payments & Subscriptions
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),
  BACKEND_URL: z.string().default('http://localhost:5000'),

  // OTP Configuration
  OTP_EXPIRES_MINUTES: z.coerce.number().optional().default(10),
  OTP_EXPIRY_MINUTES: z.coerce.number().optional().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().optional().default(5),

  // WhatsApp Cloud API Integration
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_GRAPH_API_VERSION: z.string().optional().default('v20.0'),
  WHATSAPP_VERIFY_TOKEN: z.string().optional().default('varnam_whatsapp_verify_token'),
  WHATSAPP_APP_SECRET: z.string().optional().default(''),
});

/**
 * Validates environment variables against schema
 * @returns {z.infer<typeof envSchema>}
 */
export const validateEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Environment validation failed:');
    result.error.issues.forEach((issue) => {
      console.error(` - ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }
  return result.data;
};

export const env = validateEnv();
