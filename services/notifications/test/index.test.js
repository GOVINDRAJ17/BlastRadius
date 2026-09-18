const test = require('node:test');
const assert = require('node:assert/strict');
const { sendPaymentReceipt } = require('../index.js');

test('notifications/sendPaymentReceipt sends receipt for valid payload', () => {
  const result = sendPaymentReceipt('customer@example.com', {
    transactionId: 'txn_123456',
    amountFormatted: 'USD 99.00'
  });

  assert.equal(result.sent, true);
  assert.ok(result.notificationId.startsWith('notif_'));
  assert.equal(result.recipient, 'customer@example.com');
  assert.ok(result.message.includes('txn_123456'));
});

test('notifications/sendPaymentReceipt rejects invalid email', () => {
  const result = sendPaymentReceipt('bad-email', { transactionId: 'txn_123' });
  assert.equal(result.sent, false);
  assert.equal(result.error, 'Invalid recipient email');
});

test('notifications/sendPaymentReceipt rejects missing transactionId', () => {
  const result = sendPaymentReceipt('customer@example.com', {});
  assert.equal(result.sent, false);
  assert.equal(result.error, 'Invalid payment details');
});
