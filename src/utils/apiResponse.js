/**
 * Standard API error class
 */
export class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Error message
   * @param {Array|null} errors - Detailed validation or sub-errors
   */
  constructor(statusCode, message, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad Request', errors = null) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict') {
    return new ApiError(409, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message);
  }
}

/**
 * Standard API response helper
 */
export const ApiResponse = {
  success: (res, { statusCode = 200, message = 'Success', data = null, meta = null } = {}) => {
    const payload = {
      success: true,
      message,
    };
    if (data !== null) payload.data = data;
    if (meta !== null) payload.meta = meta;
    return res.status(statusCode).json(payload);
  },

  error: (res, { statusCode = 500, message = 'An error occurred', errors = null } = {}) => {
    const payload = {
      success: false,
      message,
    };
    if (errors !== null) payload.errors = errors;
    return res.status(statusCode).json(payload);
  },
};
