const test = require('node:test');
const assert = require('node:assert/strict');
const { generateToken, verifyToken } = require('../index.js');

test('auth/generateToken creates valid token for valid user', () => {
  const token = generateToken({ id: 'usr_123', email: 'alice@example.com', role: 'admin' });
  assert.ok(typeof token === 'string');
  assert.ok(token.startsWith('ey-'));
});

test('auth/generateToken rejects invalid email', () => {
  assert.throws(() => generateToken({ id: 'usr_123', email: 'invalid' }));
});

test('auth/verifyToken correctly validates token', () => {
  const token = generateToken({ id: 'usr_456', email: 'bob@example.com' });
  const result = verifyToken(token);
  assert.equal(result.valid, true);
  assert.equal(result.user.userId, 'usr_456');
  assert.equal(result.user.email, 'bob@example.com');
});

test('auth/verifyToken rejects bad tokens', () => {
  assert.equal(verifyToken('bad-token').valid, false);
  assert.equal(verifyToken(null).valid, false);
});
