const test = require('node:test');
const assert = require('node:assert/strict');
const { logger, formatCurrency, validateEmail } = require('../index.js');

test('shared/formatCurrency formats numbers correctly', () => {
  assert.equal(formatCurrency(49.9), 'USD 49.90');
  assert.equal(formatCurrency(100, 'EUR'), 'EUR 100.00');
});

test('shared/formatCurrency rejects invalid numbers', () => {
  assert.throws(() => formatCurrency('invalid'), TypeError);
});

test('shared/validateEmail validates email addresses', () => {
  assert.equal(validateEmail('test@example.com'), true);
  assert.equal(validateEmail('invalid-email'), false);
});

test('shared/logger produces formatted log strings', () => {
  const log = logger.info('Test event', { service: 'shared' });
  assert.ok(log.includes('[INFO]'));
  assert.ok(log.includes('Test event'));
});
