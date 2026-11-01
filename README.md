# Bridal & Makeup Business Management Software — Backend Foundation & Email OTP Authentication

Developed by **VEXA TECH**

Production-ready backend foundation for a multi-tenant SaaS application designed to manage bridal makeup businesses, appointments, artists, quotes, inventory, customer workflows, and secure email OTP registration.

---

## 1. Technology Stack

- **Runtime**: Node.js (ES Modules, `"type": "module"`)
- **Web Framework**: Express.js
- **Database**: PostgreSQL (Database: `BridalSofwtwareDb`)
- **ORM**: Prisma ORM v6 (`@prisma/client@6`, `prisma@6`)
- **Authentication**: JWT & `bcryptjs`
- **Email Service**: Nodemailer (via SMTP with TLS)
- **Validation**: Zod
- **Security**: Helmet, CORS, constant-time OTP hash verification
- **Logging**: Morgan HTTP logger
- **Development**: Nodemon

---

## 2. Project Structure

```
bridal-makeup-backend/
├── prisma/
│   └── schema.prisma           # Introspected PostgreSQL schema (30 models)
├── scripts/
│   ├── migrate-email-verifications.js # Non-destructive email_verifications table creation
│   ├── test-smtp.js            # GoDaddy SMTP transport test script
│   └── test-auth-flow.js       # End-to-end authentication test suite
├── src/
│   ├── config/
│   │   ├── env.js              # Zod environment variable validator
│   │   ├── mailer.js           # Reusable Nodemailer transporter
│   │   └── prisma.js           # Singleton Prisma client instance
│   ├── controllers/
│   │   ├── auth.controller.js  # Registration, OTP verification, login, profile, logout
│   │   └── healthController.js # System health and status controller
│   ├── middleware/
│   │   ├── auth.middleware.js  # Bearer JWT verification & active user loader
│   │   ├── errorHandler.js     # 404 & Centralized error handler
│   │   ├── tenant.js           # Multi-tenant isolation guard
│   │   └── validate.js         # Zod request validation middleware
│   ├── routes/
│   │   ├── auth.routes.js      # /api/auth/* endpoint declarations
│   │   └── index.js            # Central API route index
│   ├── services/
│   │   ├── auth.service.js     # Auth & OTP transaction logic
│   │   └── email.service.js    # Professional HTML email notification delivery
│   ├── utils/
│   │   ├── apiResponse.js      # Standardized ApiResponse & ApiError helpers
│   │   ├── generate-token.js   # JWT generation and verification
│   │   └── otp.js              # Crypto 6-digit OTP generator & timing-safe hash verifier
│   ├── validators/
│   │   └── auth.validator.js   # Zod validation schemas for auth endpoints
│   ├── app.js                  # Express app setup and middleware pipeline
│   └── server.js               # Database pre-connection and server runner
├── .env                        # Local environment variables (git-ignored)
├── .env.example                # Example environment variables template
├── .gitignore                  # Git ignore rules
├── package.json                # Project dependencies and lifecycle scripts
└── README.md                   # Documentation
```

---

## 3. Database Safety & Schema Extension

> [!WARNING]
> **DO NOT RESET, DROP, OR RECREATE THE EXISTING DATABASE.**
> - Do not run `prisma migrate dev`, `prisma migrate reset`, or `prisma db push`.
> - Existing tables, records, constraints, and enums are completely preserved.
> - An additive `email_verifications` table was created via `CREATE TABLE IF NOT EXISTS` to store hashed OTPs, expiry timestamps, attempt counters, and single-use flags without touching existing tables.

---

## 4. Environment Configuration

Copy `.env.example` to `.env`:

```env
PORT=5000
DATABASE_URL="postgresql://postgres:password@localhost:5432/BridalSofwtwareDb?schema=public"
JWT_SECRET="your-secure-random-secret"
JWT_EXPIRES_IN="1d"
NODE_ENV="development"
FRONTEND_URL="http://localhost:3000"

# SMTP Configuration
SMTP_HOST="smtpout.secureserver.net"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="noreply@vexatech.in"
SMTP_PASS="your-email-password"
SMTP_FROM="VEXA TECH <noreply@vexatech.in>"
FROM_EMAIL="noreply@vexatech.in"

# OTP Configuration
OTP_EXPIRES_MINUTES=10
OTP_MAX_ATTEMPTS=5
```

---

## 5. API Endpoints

### Public Endpoints

#### 1. Register User
`POST /api/auth/register`
```json
{
  "name": "Bridal Studio Owner",
  "email": "owner@example.com",
  "password": "SecurePassword123"
}
```
- Hashes password with `bcryptjs`.
- Creates/updates pending user record (`is_email_verified = false`).
- Generates 6-digit cryptographically secure OTP, hashes it with SHA-256, and stores it with a 10-minute expiry.
- Sends a branded HTML verification email via SMTP (`noreply@vexatech.in`).
- Returns `{ "success": true, "data": { "requiresEmailVerification": true } }`.

#### 2. Verify Email OTP
`POST /api/auth/verify-email`
```json
{
  "email": "owner@example.com",
  "otp": "123456"
}
```
- Performs atomic transaction check.
- Verifies attempt limits (maximum 5 attempts) and expiration.
- Uses constant-time equality check against stored OTP hash to prevent timing attacks.
- Marks OTP consumed and activates user (`is_email_verified = true`).

#### 3. Resend OTP
`POST /api/auth/resend-otp`
```json
{
  "email": "owner@example.com"
}
```
- Enforces a 60-second cooldown period between OTP generation requests.
- Invalidates any prior active OTPs and sends a new one.

#### 4. Login
`POST /api/auth/login`
```json
{
  "email": "owner@example.com",
  "password": "SecurePassword123"
}
```
- Rejects unverified accounts with HTTP 403.
- Validates password hash.
- Issues signed Bearer JWT token.
- Returns user profile and authorized active business memberships.

#### 5. Logout
`POST /api/auth/logout`
- Confirms client session termination.

### Protected Endpoints

#### Current User Profile
`GET /api/auth/me`
- Requires `Authorization: Bearer <token>`.
- Rejects expired, invalid, or unverified tokens.
- Returns current user profile and active business memberships.

---

## 6. Business Management & Subscription Entitlements (Phase 3)

### Commercial Subscription Tiers

1. **Basic Monthly (`BASIC_MONTHLY`)**:
   - Price: **₹599 / month** (`price_paise = 59900`).
   - Includes: CRM, Bookings, Calendar, Services & Packages, Payments & Invoicing, Inventory, Staff & Role Management, Basic Reports.
   - Initial 14-day trial assigned automatically upon studio creation.

2. **Exclusive One-Time (`EXCLUSIVE_LIFETIME`)**:
   - Price: **₹29,999 one-time** (`price_paise = 2999900`).
   - Includes: All Basic Core modules **PLUS** Branded Studio Website (`BRANDED_WEBSITE`), Public Service Catalogue (`PUBLIC_CATALOGUE`), Portfolio Lookbook (`PORTFOLIO_SHOWCASE`), Website Enquiry Form (`WEBSITE_ENQUIRY`), Consultation Trial Booking (`CONSULTATION_REQUESTS`), and Studio GPS Location Sharing (`LOCATION_SHARING`).

### Business Management Endpoints (`/api/business`)

- **`POST /api/business`**:
  - Requires Bearer JWT.
  - Derives owner strictly from authenticated user (`req.user.id`).
  - Creates the business, membership with role `OWNER`, trial entitlement on `BASIC_MONTHLY`, and draft website entity in an atomic Prisma transaction.
  - Prevents accidental duplicate business ownership with HTTP 409 Conflict.
- **`GET /api/business`**:
  - Returns only businesses the authenticated user is an active member of.
- **`GET /api/business/:businessId`**:
  - Scoped to authorized business members; returns full studio profile, staff counts, and subscription status.
- **`PATCH /api/business/:businessId`**:
  - Restricts modification to `OWNER` or `MANAGER` roles.
  - Allows editing profile fields: `name`, `phone`, `email`, `address`, `description`, `logoUrl`, `websiteUrl`.
  - Disallows tampering with `owner_id`, `status`, or subscription entitlements.
- **`GET /api/business/:businessId/summary`**:
  - Returns studio profile, actual database counts (customers, enquiries, confirmed bookings, catalog services, inventory items, active staff), and feature entitlement flags.

### Subscription Endpoints (`/api/subscriptions`)

- **`GET /api/subscriptions/plans`**:
  - Public / authenticated endpoint listing commercial plans and their full feature matrix.
- **`GET /api/subscriptions/me`**:
  - Returns the authenticated user's business subscription, plan code, billing interval, trial expiration, and feature entitlements.
- **`GET /api/subscriptions/:businessId/features`**:
  - Returns authorized feature keys and a boolean access map for the specified business.

### Server-Side Entitlement Guard

Use `requireEntitlement(featureKey)` to enforce server-side feature access:
```javascript
import { requireEntitlement } from '../middleware/entitlement.middleware.js';

router.get('/:businessId/portfolio', requireEntitlement('PORTFOLIO_SHOWCASE'), getPortfolioHandler);
```
- Verifies business membership and active subscription status.
- Evaluates plan features and custom overrides.
- Returns `403 Forbidden` if the feature is unavailable or subscription has expired.

---

## 7. Customer Management & Enquiry CRM (Phase 4)

### Customer Management Endpoints (`/api/customers`)

- **`POST /api/customers`**:
  - Requires Bearer JWT + Business Member context (`x-business-id` or param).
  - Creates client profile (`full_name`, `phone`, `email`, `alternate_phone`, `address`, `city`, `notes`).
  - Enforces per-business phone uniqueness (`@@unique([business_id, phone])`).
- **`GET /api/customers`**:
  - Scoped to authorized business tenant.
  - Supports pagination (`page`, `limit`), text search (`search` matches name, phone, or email), city filter, and sorting (`sortBy`, `sortOrder`).
  - Excludes soft-archived customers by default unless `includeArchived=true`.
- **`GET /api/customers/:id`**:
  - Retrieves customer profile with attached enquiries history, booking records, and preferences.
- **`PATCH /api/customers/:id`**:
  - Allows editing permitted profile fields with uniqueness checks.
- **`PATCH /api/customers/:id/archive`**:
  - Non-destructively soft-archives the customer without touching historical bookings, payments, or audit logs.

### Enquiry CRM & Follow-ups (`/api/enquiries`)

- **`POST /api/enquiries`**:
  - Creates a new wedding or event lead.
  - Automatically resolves or creates the corresponding client record by phone.
  - Creates an initial activity record in an atomic transaction.
- **`GET /api/enquiries`**:
  - Lists enquiries with pagination, status filters (`NEW`, `CONTACTED`, `CONSULTATION`, `QUOTATION_SENT`, `FOLLOW_UP`, `CONVERTED`, `LOST`), event kind, source, and date range filters.
- **`GET /api/enquiries/follow-ups`**:
  - Returns follow-ups categorized by urgency: `today`, `upcoming`, or `overdue` calculated based on server time (`Asia/Kolkata`).
- **`GET /api/enquiries/:id`**:
  - Returns complete enquiry details, client summary, package details, assigned staff, and interaction timeline (`enquiry_activities`).
- **`PATCH /api/enquiries/:id`**:
  - Allows editing details and enforces valid status transitions (e.g., `LOST` cannot jump directly to `CONVERTED`).
- **`POST /api/enquiries/:id/activities`**:
  - Records interaction logs: `PHONE_CALL`, `WHATSAPP`, `EMAIL`, `CONSULTATION`, `NOTE`, etc.
- **`POST /api/enquiries/:id/convert`**:
  - Atomically converts an eligible enquiry into a confirmed `bookings` record and creates the initial `booking_events` schedule entry.
  - Updates enquiry status to `CONVERTED`.
  - Rejects duplicate conversion attempts with HTTP 409 Conflict.

---

## 8. Booking Management & Wedding Calendar (Phase 5)

### Booking Endpoints (`/api/bookings`)

- **`POST /api/bookings`**:
  - Creates a confirmed bridal booking with optional initial ceremonies and conflict detection.
  - Automatically records initial status history in `booking_status_history`.
- **`GET /api/bookings`**:
  - Lists bookings scoped to active studio with pagination, search, status filters (`CONFIRMED`, `PLANNING`, `READY`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `POSTPONED`), and ceremony date range filters.
- **`GET /api/bookings/:id`**:
  - Returns complete booking information, client details, ceremony events, bundled package services, status workflow audit trail, and computed payment summary.
- **`PATCH /api/bookings/:id`**:
  - Updates agreed totals, discounts, package assignment, and studio notes for active bookings.
- **`PATCH /api/bookings/:id/status`**:
  - Enforces strict workflow state transitions (`DRAFT` $\to$ `CONFIRMED` $\to$ `PLANNING` $\to$ `READY` $\to$ `IN_PROGRESS` $\to$ `COMPLETED`).
- **`POST /api/bookings/:id/events`**:
  - Adds ceremony events (Wedding, Muhurtham, Sangeet, Haldi, Reception, Pre-wedding) with automated schedule conflict detection for overlapping hours.
- **`GET /api/bookings/calendar`**:
  - Returns scheduled events formatted for day, week, and month visual views within `startDate` and `endDate`.
  - Excludes cancelled booking events by default.
- **`POST /api/bookings/:id/cancel`**:
  - Safely cancels a booking, records cancellation reason, and removes events from active calendar without deleting financial or operational history.
- **`GET /api/bookings/:id/payments`**:
  - Returns recorded manual payment receipts, total paid, and outstanding balance due in integer paise.

---

---

## 9. Manual Payment Management & Financial Tracking (Phase 6)

### Payment Endpoints (`/api/payments`)

- **`POST /api/payments`**:
  - Records manual cash, UPI, bank transfer, or card payment against an authorized booking.
  - Automatically generates a cryptographically unique receipt number (`REC-<TIMESTAMP>-<HASH>`).
  - Stores monetary amounts in integer paise (`amount_paise`).
- **`GET /api/payments`**:
  - Lists payments scoped to active studio with pagination, payment method filter, status filter, and date range filters.
- **`GET /api/payments/:id`**:
  - Retrieves single payment details with associated customer and booking information.
- **`GET /api/payments/:id/receipt`**:
  - Generates a branded studio receipt with business contact details, customer name, booking reference, receipt number, payment date, method, and amount.
- **`POST /api/payments/:id/refund`**:
  - Processes full or partial refunds atomically in a Prisma transaction, preserving original payment records and updating notes with the audit trail.
  - Blocks refunds that exceed the original payment amount with HTTP 400 Bad Request.

### Expense Management Endpoints (`/api/expenses`)

- **`POST /api/expenses`**:
  - Records studio operational expenses (Cosmetics restocking, rent, assistant pay, travel) under the authorized business.
- **`GET /api/expenses`**:
  - Lists expenses with category and date range filtering and pagination.
- **`GET /api/expenses/:id`**:
  - Retrieves single studio expense record details.
- **`PATCH /api/expenses/:id`**:
  - Updates permitted expense fields (description, amount, vendor, receipt URL, notes, status).

### Financial Reporting (`/api/reports`)

- **`GET /api/reports/financial`**:
  - Protected to `OWNER` or `MANAGER` roles.
  - Supports optional `startDate` and `endDate` date filters.
  - Generates executive financial reports distinguishing:
    1. **Booking Value**: Agreed contract revenue for bookings created in the period.
    2. **Payments Collected**: Actual cash/UPI/bank receipts recorded in the period.
    3. **Refunds Processed**: Money refunded to clients during the period.
    4. **Net Cash Collected**: Payments collected minus refunds processed.
    5. **Studio Expenses**: Total operational expenditure recorded in the period.
    6. **Net Cash Movement**: Net cash collected minus operational expenses.
    7. **Outstanding Balances**: Total unpaid balances across active studio bookings.

---

## 10. How to Run & Test

### Run Phase 6 Payments, Expenses & Reports Suite
```bash
node scripts/test-phase6-flow.js
```

### Run Phase 5 Booking & Wedding Calendar Suite
```bash
node scripts/test-phase5-flow.js
```

### Run Phase 4 Customer & Enquiry CRM Suite
```bash
node scripts/test-phase4-flow.js
```

### Run Phase 3 Business & Subscription Test Suite
```bash
node scripts/test-phase3-flow.js
```

### Run End-to-End Auth Suite
```bash
node scripts/test-auth-flow.js
```

### Run SMTP Transport Test
```bash
node scripts/test-smtp.js
```

### Seed Subscription Plans & Features
```bash
node scripts/seed-plans.js
```

### Start Development Server
```bash
npm run dev
```

