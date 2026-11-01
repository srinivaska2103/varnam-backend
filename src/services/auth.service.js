import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { generateOtp, hashOtp, verifyOtpHash } from '../utils/otp.js';
import { generateAccessToken } from '../utils/generate-token.js';
import { emailService } from './email.service.js';
import { ApiError } from '../utils/apiResponse.js';

export const authService = {
  /**
   * Register a new user:
   * 1. Check if user already exists.
   * 2. Hash password.
   * 3. Upsert user record (is_email_verified = false).
   * 4. Invalidate prior OTPs, create fresh hashed OTP with 10 min expiry.
   * 5. Send OTP email via SMTP.
   */
  async register({ name, email, password }) {
    const normalizedEmail = email.trim().toLowerCase();

    // Check if an existing verified user with this email exists
    const existingUser = await prisma.users.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser && existingUser.is_email_verified) {
      // Return ambiguous success response to prevent user enumeration attacks
      return {
        requiresEmailVerification: true,
      };
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // Upsert user record in pending verification state
    let user;
    if (existingUser) {
      user = await prisma.users.update({
        where: { id: existingUser.id },
        data: {
          name: name.trim(),
          password_hash: passwordHash,
          is_email_verified: false,
          is_active: true,
        },
      });
    } else {
      user = await prisma.users.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          password_hash: passwordHash,
          is_email_verified: false,
          is_active: true,
        },
      });

      // Automatically provision a default bridal studio for the newly registered user
      try {
        const studioSlug = (name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-') || 'bridal-studio') + '-' + Math.random().toString(36).substring(2, 7);
        const newBiz = await prisma.businesses.create({
          data: {
            name: `${name.trim()}'s Bridal Studio`,
            slug: studioSlug,
            business_email: normalizedEmail,
            country: 'IN',
            timezone: 'Asia/Kolkata',
            currency: 'INR',
            status: 'ACTIVE',
            logo_url: '/varnam-logo.png',
          },
        });

        await prisma.business_members.create({
          data: {
            business_id: newBiz.id,
            user_id: user.id,
            role: 'OWNER',
            is_active: true,
          },
        });

        const starterPlan = await prisma.plans.findFirst({
          where: { code: 'STARTER', is_active: true },
        });

        if (starterPlan) {
          const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
          await prisma.business_entitlements.create({
            data: {
              business_id: newBiz.id,
              plan_id: starterPlan.id,
              status: 'TRIAL',
              starts_at: new Date(),
              expires_at: trialEnds,
              auto_renew: false,
            },
          });
        }
      } catch (bizErr) {
        console.error('Auto studio provisioning warning:', bizErr);
      }
    }

    // Generate secure 6-digit OTP
    const plainOtp = generateOtp();
    const hashed = hashOtp(plainOtp);
    const expiryMinutes = env.OTP_EXPIRES_MINUTES || 10;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Invalidate any previous unconsumed verification records for this email
    await prisma.email_verifications.updateMany({
      where: {
        email: normalizedEmail,
        is_consumed: false,
      },
      data: {
        is_consumed: true,
      },
    });

    // Create new email_verification record
    await prisma.email_verifications.create({
      data: {
        email: normalizedEmail,
        otp_hash: hashed,
        expires_at: expiresAt,
        max_attempts: env.OTP_MAX_ATTEMPTS || 5,
        attempts: 0,
        is_consumed: false,
      },
    });

    // Send email via SMTP (if this fails, it throws and registration fails before reporting success)
    await emailService.sendVerificationOtp({
      to: normalizedEmail,
      name: user.name,
      otp: plainOtp,
      expiryMinutes,
    });

    return {
      requiresEmailVerification: true,
      userId: user.id,
    };
  },

  /**
   * Resend OTP for pending verification:
   * 1. Validate rate limits & cooldown (1 minute cooldown).
   * 2. Invalidate previous OTP.
   * 3. Send fresh OTP.
   */
  async resendOtp({ email, userId }) {
    let normalizedEmail = email ? email.trim().toLowerCase() : null;

    let user;
    if (userId) {
      user = await prisma.users.findUnique({
        where: { id: userId },
      });
      if (user) normalizedEmail = user.email;
    } else if (normalizedEmail) {
      user = await prisma.users.findUnique({
        where: { email: normalizedEmail },
      });
    }

    // Ambiguous response if user does not exist or is already verified
    if (!user || user.is_email_verified) {
      return { sent: true };
    }

    // Check cooldown: ensure at least 60 seconds since last OTP creation
    const latestOtp = await prisma.email_verifications.findFirst({
      where: { email: normalizedEmail },
      orderBy: { created_at: 'desc' },
    });

    if (latestOtp) {
      const timeSinceLastOtpMs = Date.now() - new Date(latestOtp.created_at).getTime();
      const cooldownMs = 60 * 1000;
      if (timeSinceLastOtpMs < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - timeSinceLastOtpMs) / 1000);
        throw ApiError.badRequest(
          `Please wait ${remainingSeconds} seconds before requesting a new OTP.`
        );
      }
    }

    // Invalidate existing OTPs
    await prisma.email_verifications.updateMany({
      where: {
        email: normalizedEmail,
        is_consumed: false,
      },
      data: {
        is_consumed: true,
      },
    });

    const plainOtp = generateOtp();
    const hashed = hashOtp(plainOtp);
    const expiryMinutes = env.OTP_EXPIRES_MINUTES || 10;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    await prisma.email_verifications.create({
      data: {
        email: normalizedEmail,
        otp_hash: hashed,
        expires_at: expiresAt,
        max_attempts: env.OTP_MAX_ATTEMPTS || 5,
        attempts: 0,
        is_consumed: false,
      },
    });

    await emailService.sendVerificationOtp({
      to: normalizedEmail,
      name: user.name,
      otp: plainOtp,
      expiryMinutes,
    });

    return { sent: true };
  },

  /**
   * Verify email OTP:
   * 1. Find active verification record.
   * 2. Check consumed, expiry, and attempt limits.
   * 3. Verify OTP hash with constant-time equality.
   * 4. Mark user is_email_verified = true atomically.
   */
  async verifyEmail({ email, userId, otp }) {
    let normalizedEmail = email ? email.trim().toLowerCase() : null;
    const cleanOtp = String(otp).trim();

    if (!normalizedEmail && userId) {
      const u = await prisma.users.findUnique({ where: { id: userId } });
      if (u) normalizedEmail = u.email;
    }

    if (!normalizedEmail) {
      throw ApiError.badRequest('Email address or user identifier is required.');
    }

    // Use transaction to prevent race conditions & double-consumption
    return await prisma.$transaction(async (tx) => {
      // Find latest unconsumed verification record
      const verification = await tx.email_verifications.findFirst({
        where: {
          email: normalizedEmail,
          is_consumed: false,
        },
        orderBy: { created_at: 'desc' },
      });

      if (!verification) {
        throw ApiError.badRequest('Invalid or expired verification code');
      }

      // Check max attempts
      if (verification.attempts >= verification.max_attempts) {
        await tx.email_verifications.update({
          where: { id: verification.id },
          data: { is_consumed: true },
        });
        throw ApiError.badRequest('Verification attempt limit exceeded. Please request a new OTP.');
      }

      // Check expiration
      if (new Date() > new Date(verification.expires_at)) {
        await tx.email_verifications.update({
          where: { id: verification.id },
          data: { is_consumed: true },
        });
        throw ApiError.badRequest('Verification code has expired. Please request a new OTP.');
      }

      // Verify OTP hash
      const isValid = verifyOtpHash(cleanOtp, verification.otp_hash);

      if (!isValid) {
        // Increment attempts count
        const updated = await tx.email_verifications.update({
          where: { id: verification.id },
          data: {
            attempts: { increment: 1 },
            updated_at: new Date(),
          },
        });

        const remainingAttempts = updated.max_attempts - updated.attempts;
        if (remainingAttempts <= 0) {
          await tx.email_verifications.update({
            where: { id: verification.id },
            data: { is_consumed: true },
          });
          throw ApiError.badRequest('Maximum attempts exceeded. Please request a new OTP.');
        }

        throw ApiError.badRequest(`Invalid verification code. ${remainingAttempts} attempts remaining.`);
      }

      // Valid OTP: consume OTP record
      await tx.email_verifications.update({
        where: { id: verification.id },
        data: {
          is_consumed: true,
          updated_at: new Date(),
        },
      });

      // Mark user as email verified
      const updatedUser = await tx.users.update({
        where: { email: normalizedEmail },
        data: {
          is_email_verified: true,
          updated_at: new Date(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          is_email_verified: true,
          is_active: true,
          created_at: true,
        },
      });

      return {
        verified: true,
        user: updatedUser,
      };
    });
  },

  /**
   * Login user:
   * 1. Validate credentials.
   * 2. Reject unverified accounts.
   * 3. Issue JWT access token.
   * 4. Return user profile and authorized business memberships.
   */
  async login({ email, password }) {
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    console.log(`[AUTH LOGIN ATTEMPT] email: "${normalizedEmail}", password length: ${password?.length}`);

    const user = await prisma.users.findUnique({
      where: { email: normalizedEmail },
      include: {
        business_members: {
          where: { is_active: true },
          include: {
            businesses: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                logo_url: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    if (!user.is_active) {
      throw ApiError.forbidden('Your account has been deactivated. Please contact support.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    if (!user.is_email_verified) {
      throw ApiError.forbidden('Please verify your email address before logging in.');
    }

    // Update last_login_at
    await prisma.users.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    // Format business memberships safely
    const memberships = user.business_members.map((m) => ({
      memberId: m.id,
      businessId: m.business_id,
      businessName: m.businesses.name,
      businessSlug: m.businesses.slug,
      businessLogo: m.businesses.logo_url,
      role: m.role,
      isActive: m.is_active,
    }));

    // Generate JWT token containing safe claims
    const token = generateAccessToken({
      userId: user.id,
      email: user.email,
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: memberships[0]?.role || (user.is_super_admin ? 'SUPER_ADMIN' : 'OWNER'),
        is_email_verified: user.is_email_verified,
        is_super_admin: Boolean(user.is_super_admin),
        last_login_at: new Date(),
      },
      memberships,
    };
  },

  /**
   * Get current authenticated user profile
   */
  async getMe(userId) {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      include: {
        business_members: {
          where: { is_active: true },
          include: {
            businesses: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                logo_url: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.is_active) {
      throw ApiError.unauthorized('User not found or inactive');
    }

    const memberships = user.business_members.map((m) => ({
      memberId: m.id,
      businessId: m.business_id,
      businessName: m.businesses.name,
      businessSlug: m.businesses.slug,
      businessLogo: m.businesses.logo_url,
      role: m.role,
      isActive: m.is_active,
    }));

    // Primary role in first active membership
    const primaryRole = memberships[0]?.role || (user.is_super_admin ? 'SUPER_ADMIN' : 'USER');

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: primaryRole,
      is_email_verified: user.is_email_verified,
      is_super_admin: Boolean(user.is_super_admin),
      created_at: user.created_at,
      memberships,
    };
  },

  /**
   * Request password reset OTP:
   * 1. Check if user exists.
   * 2. Invalidate previous OTPs.
   * 3. Create fresh 6-digit OTP in email_verifications.
   * 4. Send reset email with OTP.
   */
  async forgotPassword({ email }) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.users.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Do not reveal if email exists or not to prevent user enumeration
      return { sent: true };
    }

    const plainOtp = generateOtp();
    const hashed = hashOtp(plainOtp);
    const expiryMinutes = env.OTP_EXPIRES_MINUTES || 10;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Invalidate existing active verification records for this email
    await prisma.email_verifications.updateMany({
      where: {
        email: normalizedEmail,
        is_consumed: false,
      },
      data: {
        is_consumed: true,
      },
    });

    // Create new OTP record
    await prisma.email_verifications.create({
      data: {
        email: normalizedEmail,
        otp_hash: hashed,
        expires_at: expiresAt,
        max_attempts: env.OTP_MAX_ATTEMPTS || 5,
        attempts: 0,
        is_consumed: false,
      },
    });

    // Dispatch OTP email
    await emailService.sendPasswordResetOtp({
      to: normalizedEmail,
      name: user.name,
      otp: plainOtp,
      expiryMinutes,
    });

    return { sent: true };
  },

  /**
   * Reset Password with OTP:
   * 1. Validate unconsumed OTP in email_verifications.
   * 2. Check expiry and max attempts.
   * 3. Verify OTP hash.
   * 4. Update user password_hash in database.
   * 5. Consume OTP.
   */
  async resetPassword({ email, otp, newPassword }) {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    const user = await prisma.users.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw ApiError.badRequest('Invalid or expired password reset request.');
    }

    return await prisma.$transaction(async (tx) => {
      // Find latest unconsumed verification record
      const verification = await tx.email_verifications.findFirst({
        where: {
          email: normalizedEmail,
          is_consumed: false,
        },
        orderBy: { created_at: 'desc' },
      });

      if (!verification) {
        throw ApiError.badRequest('Invalid or expired verification code.');
      }

      // Check max attempts
      if (verification.attempts >= verification.max_attempts) {
        await tx.email_verifications.update({
          where: { id: verification.id },
          data: { is_consumed: true },
        });
        throw ApiError.badRequest('Maximum attempts exceeded. Please request a new verification code.');
      }

      // Check expiration
      if (new Date() > new Date(verification.expires_at)) {
        await tx.email_verifications.update({
          where: { id: verification.id },
          data: { is_consumed: true },
        });
        throw ApiError.badRequest('Verification code has expired. Please request a new one.');
      }

      // Verify OTP hash
      const isValid = verifyOtpHash(cleanOtp, verification.otp_hash);

      if (!isValid) {
        const updated = await tx.email_verifications.update({
          where: { id: verification.id },
          data: {
            attempts: { increment: 1 },
            updated_at: new Date(),
          },
        });

        const remainingAttempts = updated.max_attempts - updated.attempts;
        if (remainingAttempts <= 0) {
          await tx.email_verifications.update({
            where: { id: verification.id },
            data: { is_consumed: true },
          });
          throw ApiError.badRequest('Maximum attempts exceeded. Please request a new verification code.');
        }

        throw ApiError.badRequest(`Invalid verification code. ${remainingAttempts} attempts remaining.`);
      }

      // Valid OTP: consume OTP record
      await tx.email_verifications.update({
        where: { id: verification.id },
        data: {
          is_consumed: true,
          updated_at: new Date(),
        },
      });

      // Hash new password
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      // Update user password and ensure email is marked verified
      await tx.users.update({
        where: { id: user.id },
        data: {
          password_hash: passwordHash,
          is_email_verified: true,
          updated_at: new Date(),
        },
      });

      return { success: true };
    });
  },

  /**
   * Dedicated Studio Employee / User Portal Login:
   * 1. Rejects self-registration or unknown studios.
   * 2. Rejects ADMIN accounts with a clear directive to use the admin portal.
   * 3. Rejects accounts from other studios or inactive user accounts.
   * 4. Returns token, user profile, and active business membership.
   */
  async studioUserLogin({ studioSlug, email, password }) {
    const cleanSlug = studioSlug.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();

    // Verify studio exists and is active
    const business = await prisma.businesses.findFirst({
      where: {
        slug: { equals: cleanSlug, mode: 'insensitive' },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        logo_url: true,
      },
    });

    if (!business) {
      throw ApiError.notFound('Bridal studio not found. Please verify the URL.');
    }

    // Find user by email
    const user = await prisma.users.findUnique({
      where: { email: normalizedEmail },
      include: {
        business_members: {
          include: {
            businesses: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                logo_url: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw ApiError.unauthorized('Invalid email or password.');
    }

    if (!user.is_active) {
      throw ApiError.forbidden('Your account has been deactivated. Please contact your studio administrator.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw ApiError.unauthorized('Invalid email or password.');
    }

    // Locate membership in this specific studio
    const targetMembership = user.business_members.find(
      (m) => m.business_id === business.id
    );

    if (!targetMembership) {
      throw ApiError.forbidden('This user account does not belong to this studio.');
    }

    if (!targetMembership.is_active) {
      throw ApiError.forbidden('Your studio access has been deactivated by the administrator.');
    }

    // Check role: If OWNER / MANAGER (admin), redirect them clearly to admin portal
    if (['OWNER', 'MANAGER'].includes(targetMembership.role)) {
      throw ApiError.forbidden(
        'This portal is exclusively for Studio Staff / Users. Since you are an administrator, please sign in via the Studio Admin Login.'
      );
    }

    // Update last_login_at
    await prisma.users.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    const memberships = [
      {
        memberId: targetMembership.id,
        businessId: business.id,
        businessName: business.name,
        businessSlug: business.slug,
        businessLogo: business.logo_url,
        role: targetMembership.role,
        isActive: targetMembership.is_active,
      },
    ];

    const token = generateAccessToken({
      userId: user.id,
      email: user.email,
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        is_email_verified: user.is_email_verified,
        role: targetMembership.role,
        last_login_at: new Date(),
      },
      memberships,
      business,
    };
  },

  /**
   * Get public studio details for User Login page branding
   */
  async getStudioPublicInfo(studioSlug) {
    const cleanSlug = studioSlug.trim().toLowerCase();
    const business = await prisma.businesses.findFirst({
      where: {
        slug: { equals: cleanSlug, mode: 'insensitive' },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        slug: true,
        logo_url: true,
        business_email: true,
        business_phone: true,
        city: true,
        state: true,
      },
    });

    if (!business) {
      throw ApiError.notFound('Bridal studio not found.');
    }

    return business;
  },
};

