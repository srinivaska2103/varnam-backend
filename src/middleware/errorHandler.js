import { ApiError, ApiResponse } from '../utils/apiResponse.js';

/**
 * 404 handler for unmatched routes
 */
export const notFoundHandler = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

/**
 * Centralized error handling middleware
 */
export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || (err.status ? err.status : 500);
  const message = err.message || 'Internal server error';

  // Do not expose sensitive database or internal stack traces in production
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev && statusCode === 500) {
    console.error('Unhandled Server Error:', err);
  }

  const payload = {
    statusCode,
    message,
    errors: err.errors || null,
  };

  return ApiResponse.error(res, payload);
};
