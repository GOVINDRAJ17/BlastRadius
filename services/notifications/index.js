/**
 * Notifications Service
 * Depends on: @monorepo/payments, @monorepo/shared
 */

const { processPayment } = require('../payments/index.js');
const { logger, validateEmail } = require('../shared/index.js');

function sendPaymentReceipt(email, paymentDetails) {
  logger.info(`Attempting to send payment receipt to ${email}`);

  if (!validateEmail(email)) {
    logger.error(`Receipt delivery aborted: invalid email ${email}`);
    return {
      sent: false,
      error: 'Invalid recipient email'
    };
  }

  if (!paymentDetails || !paymentDetails.transactionId) {
    logger.error('Receipt delivery aborted: missing transaction details');
    return {
      sent: false,
      error: 'Invalid payment details'
    };
  }

  const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const messageBody = `Receipt for transaction ${paymentDetails.transactionId}: ${paymentDetails.amountFormatted || paymentDetails.amount} received.`;

  logger.info(`Receipt dispatched: ${notificationId}`, {
    email,
    transactionId: paymentDetails.transactionId
  });

  return {
    sent: true,
    notificationId,
    recipient: email,
    message: messageBody,
    deliveredAt: new Date().toISOString()
  };
}

module.exports = {
  sendPaymentReceipt,
  processPayment
};
