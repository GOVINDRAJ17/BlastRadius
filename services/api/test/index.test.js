const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { app, redis } = require('../index.js');
const { normalizeCpuRate, calculateDockerCpuPercent, fetchFromPrometheus } = require('../containers.js');

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
      changed_services: ['search'],
      directly_affected: ['search'],
      transitively_affected: [],
      tested: ['search'],
      to_build: ['search'],
      to_deploy: ['search'],
      skipped: ['auth', 'notifications', 'payments', 'shared'],
      full_rebuild: false
    })
  });
  assert.strictEqual(res.status, 201);
  const data = await res.json();
  assert.strictEqual(data.status, 'accepted');
  assert.strictEqual(data.commit_sha, 'abc1234567890');
});

test('Invariant 1: POST /api/reports rejects when tested not subset of to_build (HTTP 422)', async () => {
  const token = process.env.REPORT_API_SECRET || 'blastradius_report_secret_default_9f8e7d';
  const res = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      commit_sha: 'inv1-test',
      changed_services: ['search'],
      directly_affected: ['search'],
      transitively_affected: [],
      tested: ['search'],
      to_build: [], // VIOLATION: tested not in to_build
      to_deploy: ['search'],
      skipped: ['auth', 'notifications', 'payments', 'shared']
    })
  });
  assert.strictEqual(res.status, 422);
  const data = await res.json();
  assert.ok(data.violations.some(v => v.includes('tested')));
});

test('Invariant 2: POST /api/reports rejects when to_deploy not subset of affected (HTTP 422)', async () => {
  const token = process.env.REPORT_API_SECRET || 'blastradius_report_secret_default_9f8e7d';
  const res = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      commit_sha: 'inv2-test',
      changed_services: ['search'],
      directly_affected: ['search'],
      transitively_affected: [],
      tested: ['search'],
      to_build: ['search'],
      to_deploy: ['payments'], // VIOLATION: payments not affected
      skipped: ['auth', 'notifications', 'shared']
    })
  });
  assert.strictEqual(res.status, 422);
  const data = await res.json();
  assert.ok(data.violations.some(v => v.includes('to_deploy')));
});

test('Invariant 3: POST /api/reports rejects when to_build != tested (HTTP 422)', async () => {
  const token = process.env.REPORT_API_SECRET || 'blastradius_report_secret_default_9f8e7d';
  const res = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      commit_sha: 'inv3-test',
      changed_services: ['search'],
      directly_affected: ['search'],
      transitively_affected: [],
      tested: ['search'],
      to_build: ['search', 'auth'], // VIOLATION: to_build != tested
      to_deploy: ['search'],
      skipped: ['notifications', 'payments', 'shared']
    })
  });
  assert.strictEqual(res.status, 422);
  const data = await res.json();
  assert.ok(data.violations.some(v => v.includes('to_build')));
});

test('Invariant 4: POST /api/reports rejects when skipped intersects active set (HTTP 422)', async () => {
  const token = process.env.REPORT_API_SECRET || 'blastradius_report_secret_default_9f8e7d';
  const res = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      commit_sha: 'inv4-test',
      changed_services: ['search'],
      directly_affected: ['search'],
      transitively_affected: [],
      tested: ['search'],
      to_build: ['search'],
      to_deploy: ['search'],
      skipped: ['search', 'auth', 'notifications', 'payments', 'shared'] // VIOLATION: search is in both
    })
  });
  assert.strictEqual(res.status, 422);
  const data = await res.json();
  assert.ok(data.violations.some(v => v.includes('skipped')));
});

test('Invariant 5 & 6: POST /api/reports rejects unknown service names (HTTP 422)', async () => {
  const token = process.env.REPORT_API_SECRET || 'blastradius_report_secret_default_9f8e7d';
  const res = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      commit_sha: 'inv5-test',
      changed_services: ['unknown_microservice_xyz'], // VIOLATION: unknown service
      directly_affected: ['unknown_microservice_xyz'],
      transitively_affected: [],
      tested: ['unknown_microservice_xyz'],
      to_build: ['unknown_microservice_xyz'],
      to_deploy: ['unknown_microservice_xyz'],
      skipped: []
    })
  });
  assert.strictEqual(res.status, 422);
  const data = await res.json();
  assert.ok(data.violations.some(v => v.includes('Unknown service name')));
});

test('Invariant 7: POST /api/reports rejects partial rebuild when full_rebuild is true (HTTP 422)', async () => {
  const token = process.env.REPORT_API_SECRET || 'blastradius_report_secret_default_9f8e7d';
  const res = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      commit_sha: 'inv7-test',
      changed_services: ['shared'],
      directly_affected: ['shared'],
      transitively_affected: ['auth'],
      tested: ['shared', 'auth'], // VIOLATION: full_rebuild must test all 5 app services
      to_build: ['shared', 'auth'],
      to_deploy: ['shared', 'auth'],
      skipped: ['notifications', 'payments', 'search'],
      full_rebuild: true
    })
  });
  assert.strictEqual(res.status, 422);
  const data = await res.json();
  assert.ok(data.violations.some(v => v.includes('full_rebuild is true')));
});

test('CPU Normalization: normalizeCpuRate normalizes usage by core count', () => {
  assert.strictEqual(normalizeCpuRate(0.5, 1), 50.0);
  assert.strictEqual(normalizeCpuRate(0.5, 2), 25.0);
  assert.strictEqual(normalizeCpuRate(1.0, 4), 25.0);
  assert.strictEqual(normalizeCpuRate(0, 4), 0.0);
  assert.strictEqual(normalizeCpuRate(-1, 2), 0.0);
  assert.strictEqual(normalizeCpuRate(NaN, 1), 0.0);
  assert.strictEqual(normalizeCpuRate(undefined, 1), 0.0);
});

test('Docker CPU calculation: calculateDockerCpuPercent handles delta and core normalization', () => {
  const stats = {
    cpu_stats: {
      cpu_usage: { total_usage: 1000000000 },
      system_cpu_usage: 2000000000
    },
    precpu_stats: {
      cpu_usage: { total_usage: 500000000 },
      system_cpu_usage: 1000000000
    }
  };
  const pct = calculateDockerCpuPercent(stats);
  assert.strictEqual(pct, 50.0);

  // Missing precpu_stats returns 0.0
  assert.strictEqual(calculateDockerCpuPercent({}), 0.0);
});

test('Container Metrics API: GET /api/containers returns 200 with container metrics contract', async () => {
  const res = await fetch(`${baseUrl}/api/containers`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.status, 'ok');
  assert.ok(Array.isArray(data.containers));
  assert.strictEqual(data.containers.length, 8);
  assert.ok(['docker-api', 'prometheus', 'unavailable', 'redis-cache'].includes(data.source));
});

test('Container Metrics Fallback: returns null with reason when Prometheus is down and socket unavailable', async () => {
  // Point to a non-existent port to simulate Prometheus down
  const result = await fetchFromPrometheus('http://127.0.0.1:59999');
  assert.strictEqual(result.status, 'ok');
  assert.strictEqual(result.source, 'unavailable');
  assert.strictEqual(result.containers.length, 8);

  for (const c of result.containers) {
    assert.strictEqual(c.cpu_percent, null);
    assert.ok(typeof c.cpu_percent_reason === 'string' && c.cpu_percent_reason.length > 0);
    assert.strictEqual(c.memory_bytes, null);
    assert.ok(typeof c.memory_bytes_reason === 'string' && c.memory_bytes_reason.length > 0);
    assert.strictEqual(c.health, null);
    assert.ok(typeof c.health_reason === 'string' && c.health_reason.length > 0);
    assert.strictEqual(c.restart_count, null);
    assert.ok(typeof c.restart_count_reason === 'string' && c.restart_count_reason.length > 0);
    assert.strictEqual(c.uptime_seconds, null);
    assert.ok(typeof c.uptime_seconds_reason === 'string' && c.uptime_seconds_reason.length > 0);
  }
});
