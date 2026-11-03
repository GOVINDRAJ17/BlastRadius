/**
 * Shared Common Utilities Package
 * Used across multiple microservices in the monorepo.
 */

const logger = {
  info: (msg, meta = {}) => `[INFO] ${new Date().toISOString()}: ${msg} ${JSON.stringify(meta)}`,
  warn: (msg, meta = {}) => `[WARN] ${new Date().toISOString()}: ${msg} ${JSON.stringify(meta)}`,
  error: (msg, meta = {}) => `[ERROR] ${new Date().toISOString()}: ${msg} ${JSON.stringify(meta)}`
};

function formatCurrency(amount, currency = 'USD') {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new TypeError('Amount must be a valid number');
  }
  return `${currency} ${amount.toFixed(2)}`;
}

function validateEmail(email) {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

module.exports = {
  logger,
  formatCurrency,
  validateEmail
};
