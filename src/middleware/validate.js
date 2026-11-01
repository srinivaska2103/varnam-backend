import { ApiError } from '../utils/apiResponse.js';

/**
 * Zod validation middleware factory
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} [source='body']
 */
export const validateRequest = (schema, source = 'body') => {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const formattedErrors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      console.error(`[ValidationError] on ${req.method} ${req.originalUrl}:`, JSON.stringify(formattedErrors, null, 2));
      return next(ApiError.badRequest('Validation error', formattedErrors));
    }
    if (source === 'body') {
      req.body = result.data;
    } else {
      // req.query or req.params might have only getters in some Express versions/middlewares
      try {
        req[source] = result.data;
      } catch {
        Object.assign(req[source], result.data);
      }
    }
    next();
  };
};
