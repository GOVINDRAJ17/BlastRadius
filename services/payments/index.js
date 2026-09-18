/**
 * Payments Service
 * Depends on: @monorepo/auth, @monorepo/shared
 */

const { verifyToken } = require('../auth/index.js');
const { logger, formatCurrency } = require('../shared/index.js');

function processPayment(authToken, amount, currency = 'USD') {
  logger.info(`Initiating payment transaction of ${amount} ${currency}`);

  const authResult = verifyToken(authToken);
  if (!authResult.valid) {
    logger.error('Payment rejected: unauthorized or invalid token');
    return {
      success: false,
      error: 'Authentication failed',
      code: 'UNAUTHORIZED'
    };
  }

  if (typeof amount !== 'number' || amount <= 0) {
    logger.error('Payment rejected: invalid amount');
    return {
      success: false,
      error: 'Invalid payment amount',
      code: 'INVALID_AMOUNT'
    };
  }

  const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const formatted = formatCurrency(amount, currency);

  logger.info(`Payment processed successfully for user ${authResult.user.userId}`, {
    transactionId,
    amount: formatted
  });

  return {
    success: true,
    transactionId,
    amountFormatted: formatted,
    amount,
    currency,
    userId: authResult.user.userId,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  processPayment
};
