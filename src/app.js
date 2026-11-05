import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import apiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { ApiResponse } from './utils/apiResponse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure BigInt values can be serialized to JSON transparently
BigInt.prototype.toJSON = function () {
  const intVal = Number(this);
  return Number.isSafeInteger(intVal) ? intVal : this.toString();
};

const app = express();

// Security headers with Helmet - configured to allow script & font delivery for the developer dashboard
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https:'],
      },
    },
  })
);

// CORS configuration - allow configured frontend, admin, landing, and all Vexatech subdomains
const allowedOrigins = [
  env.FRONTEND_URL,
  'https://varnam.vexatech.in',
  'https://app.varnam.vexatech.in',
  'https://ad.varnam.vexatech.in',
  'https://api.varnam.vextech.in',
  'https://api.varnam.vexatech.in',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, browser direct) or in development
      if (!origin || env.NODE_ENV === 'development') {
        return callback(null, true);
      }

      // Check explicit allowed origins list
      if (allowedOrigins.some((allowed) => allowed && origin.startsWith(allowed))) {
        return callback(null, true);
      }

      // Allow any *.vexatech.in or *.vextech.in domain
      try {
        const url = new URL(origin);
        if (url.hostname.endsWith('vexatech.in') || url.hostname.endsWith('vextech.in')) {
          return callback(null, true);
        }
      } catch (e) {}

      callback(new Error(`Blocked by CORS policy: ${origin}`));
    },
    credentials: true,
  })
);

// Body parsing with rawBody retention for webhook cryptographic signature verification
app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      req.rawBody = buf ? buf.toString('utf8') : '';
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP request logging
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// Serve developer dashboard static assets
app.use('/dashboard', express.static(path.join(__dirname, '../public/dashboard')));

// Root endpoint: if visited by browser (accepts HTML), serve or redirect to dashboard
app.get('/', (req, res) => {
  if (req.accepts(['html', 'json']) === 'html') {
    return res.redirect('/dashboard');
  }
  return ApiResponse.success(res, {
    message: 'Bridal & Makeup Business Management API by VEXA TECH',
    data: {
      version: '1.0.0',
      status: 'active',
      docs: '/dashboard',
      health: '/api/health',
    },
  });
});

// Centralized API routes
app.use('/api', apiRouter);

// 404 handler for unknown routes
app.use(notFoundHandler);

// Centralized error handling
app.use(errorHandler);

export default app;
