/**
 * Auth Service
 * Depends on: @monorepo/shared
 */

const { logger, validateEmail } = require('../shared/index.js');

const SECRET_KEY = process.env.JWT_SECRET || 'monorepo-super-secret-key';

function generateToken(user) {
  if (!user || !user.id || !validateEmail(user.email)) {
    throw new Error('Invalid user payload for token generation');
  }
  const payload = Buffer.from(JSON.stringify({
    userId: user.id,
    email: user.email,
    role: user.role || 'user',
    iat: Date.now()
  })).toString('base64');

  logger.info(`Generated authentication token for user ${user.id}`);
  return `ey-${payload}-${SECRET_KEY.slice(0, 6)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.startsWith('ey-')) {
    logger.warn('Token verification failed: invalid token format');
    return { valid: false, error: 'Invalid token format' };
  }

  const parts = token.split('-');
  if (parts.length < 3) {
    return { valid: false, error: 'Malformed token' };
  }

  try {
    const raw = Buffer.from(parts[1], 'base64').toString('utf-8');
    const data = JSON.parse(raw);
    logger.info(`Token successfully verified for user ${data.userId}`);
    return { valid: true, user: data };
  } catch (err) {
    logger.error('Failed to parse token payload', { error: err.message });
    return { valid: false, error: 'Failed to decode token' };
  }
}

module.exports = {
  generateToken,
  verifyToken
};
