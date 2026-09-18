const test = require('node:test');
const assert = require('node:assert/strict');
const { processPayment } = require('../index.js');
const { generateToken } = require('../../auth/index.js');

test('payments/processPayment succeeds with valid token and amount', () => {
  const token = generateToken({ id: 'usr_789', email: 'payer@example.com' });
  const result = processPayment(token, 75.5, 'USD');

  assert.equal(result.success, true);
  assert.ok(result.transactionId.startsWith('txn_'));
  assert.equal(result.amountFormatted, 'USD 75.50');
  assert.equal(result.userId, 'usr_789');
});

test('payments/processPayment fails with invalid token', () => {
  const result = processPayment('invalid-token', 100);
  assert.equal(result.success, false);
  assert.equal(result.code, 'UNAUTHORIZED');
});

test('payments/processPayment fails with invalid amount', () => {
  const token = generateToken({ id: 'usr_789', email: 'payer@example.com' });
  const result = processPayment(token, -10);
  assert.equal(result.success, false);
  assert.equal(result.code, 'INVALID_AMOUNT');
});
