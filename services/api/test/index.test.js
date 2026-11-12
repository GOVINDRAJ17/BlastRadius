const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { app, redis } = require('../index.js');

let server;
let baseUrl;

test.before((t, done) => {
  server = app.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    done();
  });
});

test.after((t, done) => {
  try {
    redis.disconnect();
  } catch {}
  server.close(done);
});

test('GET /health returns 200 with instance_id and uptime', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.status, 'ok');
  assert.ok(typeof data.instance_id === 'string');
  assert.ok(typeof data.uptime === 'number');
});

test('GET /metrics returns Prometheus formatted text metrics', async () => {
  const res = await fetch(`${baseUrl}/metrics`);
  assert.strictEqual(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('http_requests_total'));
  assert.ok(text.includes('http_request_duration_seconds'));
});

test('GET /api/runs returns 200 with runs array', async () => {
  const res = await fetch(`${baseUrl}/api/runs`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.runs));
  assert.ok(typeof data.instance_id === 'string');
});

test('GET /api/infra/status returns replicas list and active_count', async () => {
  const res = await fetch(`${baseUrl}/api/infra/status`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.replicas));
  assert.ok(data.replicas.length >= 3);
  assert.ok(typeof data.active_replicas === 'number');
});

test('POST /api/reports rejects unauthorized requests without token', async () => {
  const res = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commit_sha: 'test1234' })
  });
  assert.strictEqual(res.status, 401);
  const data = await res.json();
  assert.ok(data.error.includes('Unauthorized'));
});

test('POST /api/reports accepts authorized requests with valid token', async () => {
  const token = process.env.REPORT_API_SECRET || 'blastradius_report_secret_default_9f8e7d';
  const res = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      commit_sha: 'abc1234567890',
      to_deploy: ['search'],
      tested: ['search']
    })
  });
  assert.strictEqual(res.status, 201);
  const data = await res.json();
  assert.strictEqual(data.status, 'accepted');
  assert.strictEqual(data.commit_sha, 'abc1234567890');
});
