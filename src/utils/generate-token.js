import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Generates a signed JWT access token
 * @param {object} payload
 * @param {string} [expiresIn]
 * @returns {string}
 */
export const generateAccessToken = (payload, expiresIn = env.JWT_EXPIRES_IN) => {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn,
  });
};

/**
 * Verifies a JWT access token
 * @param {string} token
 * @returns {object} decoded token payload
 */
export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
  });
};
