/**
 * BlastRadius 2.0 - Core API Service
 * Central REST API with Prometheus metrics, Redis caching,
 * replica identity tracking, and authenticated CI report ingestion.
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');
const client = require('prom-client');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { APPLICATION_SERVICES, validateScopeContract } = require('./validator.js');

const app = express();
const PORT = process.env.API_PORT || process.env.PORT || 4000;
const INSTANCE_ID = process.env.INSTANCE_ID || 'api-standalone';
const REPORT_API_SECRET = process.env.REPORT_API_SECRET || 'blastradius_report_secret_default_9f8e7d';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:8080,https://blastradius-dashboard.vercel.app,https://blastradius-dashboard-ctxdz9bwe.vercel.app')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Prometheus Registry & Metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'blastradius_' });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status', 'instance'],
  registers: [register]
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Histogram of HTTP request durations in seconds',
  labelNames: ['method', 'route', 'status', 'instance'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register]
});

const ciRunsTotal = new client.Counter({
  name: 'ci_runs_total',
  help: 'Total count of ingested CI runs by result status',
  labelNames: ['result', 'instance'],
  registers: [register]
});

// Redis Client with Graceful Degradation
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

let isRedisConnected = false;
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => {
    return Math.min(times * 500, 3000);
  }
});

redis.on('connect', () => {
  isRedisConnected = true;
  console.log(`[${INSTANCE_ID}] Connected to Redis at ${REDIS_HOST}:${REDIS_PORT}`);
});

redis.on('ready', () => {
  isRedisConnected = true;
});

redis.on('error', (err) => {
  isRedisConnected = false;
  // Non-fatal warning; service keeps running
  // console.warn(`[${INSTANCE_ID}] Redis warning: ${err.message}`);
});

redis.on('close', () => {
  isRedisConnected = false;
});

// Attempt initial connection without crashing if Redis is offline
redis.connect().catch(() => {
  console.warn(`[${INSTANCE_ID}] Redis initially unavailable, running in local fallback mode.`);
});

// Periodic heartbeat to track active instances in Redis (unref'd to not hold event loop)
const heartbeatInterval = setInterval(async () => {
  if (isRedisConnected) {
    try {
      await redis.set(`blastradius:instance:${INSTANCE_ID}:health`, JSON.stringify({
        instance_id: INSTANCE_ID,
        status: 'healthy',
        uptime: process.uptime(),
        last_heartbeat: new Date().toISOString()
      }), 'EX', 15);
    } catch {}
  }
}, 5000);
heartbeatInterval.unref();

// Middleware
app.use(express.json({ limit: '5mb' }));

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
}));

// Request Tracking & Metrics Middleware
app.use((req, res, next) => {
  const start = process.hrtime();
  res.setHeader('X-Served-By', INSTANCE_ID);

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const duration = diff[0] + diff[1] / 1e9;
    const route = req.route ? req.route.path : req.path;
    const status = String(res.statusCode);

    httpRequestsTotal.inc({ method: req.method, route, status, instance: INSTANCE_ID });
    httpRequestDurationSeconds.observe({ method: req.method, route, status, instance: INSTANCE_ID }, duration);

    // Track real /api/* traffic counts per replica in Redis (excludes internal /health and /metrics probes)
    if (req.path.startsWith('/api/') && isRedisConnected) {
      redis.hincrby('blastradius:traffic:api_routes', INSTANCE_ID, 1).catch(() => {});
    }
  });

  next();
});

// Rate limiting for CI report ingestion
const reportsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded for CI report ingestion', instance_id: INSTANCE_ID }
});

// Helper: Constant-time string comparison for auth token
function verifyBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return false;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const token = match[1].trim();

  const expectedBuffer = Buffer.from(REPORT_API_SECRET, 'utf-8');
  const providedBuffer = Buffer.from(token, 'utf-8');

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

// -----------------------------------------------------------------------------
// ROUTES
// -----------------------------------------------------------------------------

/**
 * GET /health
 * Liveness probe. Returns 200 with instance identity.
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    instance_id: INSTANCE_ID,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /ready
 * Readiness probe. Checks Redis reachability.
 */
app.get('/ready', async (req, res) => {
  if (!isRedisConnected) {
    return res.status(503).json({
      status: 'not_ready',
      instance_id: INSTANCE_ID,
      redis: 'disconnected',
      error: 'Redis connection is offline or degraded'
    });
  }

  try {
    const ping = await redis.ping();
    if (ping === 'PONG') {
      return res.status(200).json({
        status: 'ready',
        instance_id: INSTANCE_ID,
        redis: 'connected',
        timestamp: new Date().toISOString()
      });
    }
  } catch (err) {
    return res.status(503).json({
      status: 'not_ready',
      instance_id: INSTANCE_ID,
      redis: 'disconnected',
      error: err.message
    });
  }
});

/**
 * GET /metrics
 * Exposes Prometheus metrics format.
 */
app.get('/metrics', async (req, res) => {
  try {
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * GET /api/runs
 * Recent CI runs (cache-first via Redis, fallback to local file).
 */
app.get('/api/runs', async (req, res) => {
  const cacheKey = 'blastradius:runs:latest';

  // 1. Try Redis cache
  if (isRedisConnected) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return res.status(200).json({
          source: 'redis-cache',
          instance_id: INSTANCE_ID,
          runs: parsed.runs || parsed,
          count: (parsed.runs || parsed).length
        });
      }
    } catch {}
  }

  // 2. Fallback to local metrics-history.json
  try {
    const candidates = [
      path.join(__dirname, '..', '..', 'metrics-history.json'),
      path.join(__dirname, '..', '..', 'dashboard', 'metrics-history.json'),
      path.join(process.cwd(), 'metrics-history.json')
    ];

    let runsData = null;
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        runsData = JSON.parse(fs.readFileSync(p, 'utf-8'));
        break;
      }
    }

    const runsList = runsData?.runs || [];

    // Cache in Redis with 60s TTL if connected
    if (isRedisConnected && runsList.length > 0) {
      redis.set(cacheKey, JSON.stringify(runsList), 'EX', 60).catch(() => {});
    }

    return res.status(200).json({
      source: 'local-file',
      instance_id: INSTANCE_ID,
      runs: runsList,
      count: runsList.length
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to retrieve CI runs',
      instance_id: INSTANCE_ID,
      runs: []
    });
  }
});

/**
 * GET /api/runs/:id
 * Single CI run details, including canonical deployment-scope contract.
 */
app.get('/api/runs/:id', async (req, res) => {
  const { id } = req.params;
  const cacheKey = `blastradius:run:${id}`;

  if (isRedisConnected) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.status(200).json({
          source: 'redis-cache',
          instance_id: INSTANCE_ID,
          run: JSON.parse(cached)
        });
      }
    } catch {}
  }

  // Fallback to reading current deployment-scope.json if id is 'latest' or matches current commit
  try {
    const scopePath = path.join(__dirname, '..', '..', 'deployment-scope.json');
    if (fs.existsSync(scopePath)) {
      const scopeData = JSON.parse(fs.readFileSync(scopePath, 'utf-8'));
      if (id === 'latest' || id === scopeData.commit_sha || id === scopeData.commit_sha.substring(0, 7)) {
        return res.status(200).json({
          source: 'local-scope',
          instance_id: INSTANCE_ID,
          run: {
            id,
            scope: scopeData
          }
        });
      }
    }
  } catch {}

  res.status(404).json({
    error: `Run with id '${id}' not found`,
    instance_id: INSTANCE_ID
  });
});

/**
 * GET /api/infra/status
 * Real-time replica identity, active replica counts, and container health.
 */
app.get('/api/infra/status', async (req, res) => {
  const knownReplicas = ['api-1', 'api-2', 'api-3'];
  const replicaStatus = [];

  if (isRedisConnected) {
    for (const repId of knownReplicas) {
      try {
        const raw = await redis.get(`blastradius:instance:${repId}:health`);
        if (raw) {
          const data = JSON.parse(raw);
          replicaStatus.push({
            instance_id: repId,
            status: 'healthy',
            uptime: data.uptime,
            last_heartbeat: data.last_heartbeat
          });
        } else {
          replicaStatus.push({
            instance_id: repId,
            status: 'unhealthy',
            uptime: null,
            last_heartbeat: null
          });
        }
      } catch {
        replicaStatus.push({
          instance_id: repId,
          status: 'unknown',
          uptime: null,
          last_heartbeat: null
        });
      }
    }
  } else {
    // When Redis is offline, current responding replica is healthy
    for (const repId of knownReplicas) {
      replicaStatus.push({
        instance_id: repId,
        status: repId === INSTANCE_ID ? 'healthy' : 'unknown (redis offline)',
        uptime: repId === INSTANCE_ID ? process.uptime() : null,
        last_heartbeat: repId === INSTANCE_ID ? new Date().toISOString() : null
      });
    }
  }

  const activeCount = replicaStatus.filter(r => r.status === 'healthy').length;

  const traffic = {
    source: isRedisConnected ? 'redis-counter' : 'local-counter',
    counted_routes: '/api/*',
    counts: { 'api-1': 0, 'api-2': 0, 'api-3': 0 },
    total: 0,
    timestamp: new Date().toISOString()
  };

  if (isRedisConnected) {
    try {
      const rawCounts = await redis.hgetall('blastradius:traffic:api_routes');
      if (rawCounts) {
        let total = 0;
        for (const repId of knownReplicas) {
          const count = parseInt(rawCounts[repId] || '0', 10);
          traffic.counts[repId] = count;
          total += count;
        }
        traffic.total = total;
      }
    } catch {}
  }

  res.status(200).json({
    status: 'ok',
    instance_id: INSTANCE_ID,
    redis: isRedisConnected ? 'connected' : 'disconnected',
    replicas: replicaStatus,
    active_replicas: activeCount,
    total_replicas: knownReplicas.length,
    traffic,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/deployments
 * Deployment history.
 */
app.get('/api/deployments', async (req, res) => {
  const cacheKey = 'blastradius:deployments:list';

  if (isRedisConnected) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.status(200).json({
          source: 'redis-cache',
          instance_id: INSTANCE_ID,
          deployments: JSON.parse(cached)
        });
      }
    } catch {}
  }

  // Fallback: Read from local scope if available
  const deployments = [];
  try {
    const scopePath = path.join(__dirname, '..', '..', 'deployment-scope.json');
    if (fs.existsSync(scopePath)) {
      const scope = JSON.parse(fs.readFileSync(scopePath, 'utf-8'));
      deployments.push({
        commit_sha: scope.commit_sha,
        deployed_services: scope.to_deploy || [],
        full_rebuild: scope.full_rebuild || false,
        status: 'deployed',
        deployed_at: new Date().toISOString()
      });
    }
  } catch {}

  res.status(200).json({
    source: 'local-file',
    instance_id: INSTANCE_ID,
    deployments
  });
});

/**
 * POST /api/reports
 * Authenticated ingestion of CI reports from GitHub Actions.
 */
app.post('/api/reports', reportsLimiter, async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!verifyBearerToken(authHeader)) {
    ciRunsTotal.inc({ result: 'unauthorized', instance: INSTANCE_ID });
    return res.status(401).json({
      error: 'Unauthorized: Missing or invalid Bearer token',
      instance_id: INSTANCE_ID
    });
  }

  const report = req.body;
  if (!report || typeof report !== 'object') {
    ciRunsTotal.inc({ result: 'bad_request', instance: INSTANCE_ID });
    return res.status(400).json({
      error: 'Bad Request: Report payload must be a valid JSON object',
      instance_id: INSTANCE_ID
    });
  }

  // Enforce Scope Contract Invariants
  const validation = validateScopeContract(report);
  if (!validation.valid) {
    ciRunsTotal.inc({ result: 'validation_failed', instance: INSTANCE_ID });
    return res.status(422).json({
      error: 'Unprocessable Entity: Scope contract invariants violated',
      violations: validation.errors,
      instance_id: INSTANCE_ID
    });
  }

  const runId = report.run_id || report.github_run_id || `run-${Date.now().toString(36)}`;
  const commitSha = report.commit_sha || report.commitSha || 'unknown';
  const runAttempt = String(report.run_attempt || report.github_run_attempt || '1');
  const idempotencyKey = `blastradius:idempotency:${commitSha}:${runAttempt}`;

  // Idempotency check: Reject duplicate ingestion for same commit + attempt
  if (isRedisConnected) {
    try {
      const existing = await redis.get(idempotencyKey);
      if (existing) {
        return res.status(409).json({
          error: 'Conflict: Run report already ingested for commit and attempt',
          run_id: existing,
          commit_sha: commitSha,
          run_attempt: runAttempt,
          instance_id: INSTANCE_ID
        });
      }
      await redis.set(idempotencyKey, runId, 'EX', 86400);
    } catch {}
  }

  // Cache in Redis if connected
  if (isRedisConnected) {
    try {
      await redis.set(`blastradius:run:${runId}`, JSON.stringify(report), 'EX', 86400); // 24hr TTL
      await redis.set(`blastradius:run:${commitSha.substring(0, 7)}`, JSON.stringify(report), 'EX', 86400);

      // Prepend to recent runs cache
      const recentRaw = await redis.get('blastradius:runs:latest');
      let recentRuns = recentRaw ? JSON.parse(recentRaw) : [];
      if (!Array.isArray(recentRuns)) recentRuns = [];
      recentRuns.unshift({
        runId,
        commitSha,
        timestamp: new Date().toISOString(),
        tested: report.tested || report.affectedServices || [],
        to_deploy: report.to_deploy || report.affectedServices || [],
        skipped: report.skipped || report.skippedServices || []
      });
      await redis.set('blastradius:runs:latest', JSON.stringify(recentRuns.slice(0, 50)), 'EX', 3600);
    } catch (cacheErr) {
      console.warn(`[${INSTANCE_ID}] Failed to cache ingested report in Redis:`, cacheErr.message);
    }
  }

  ciRunsTotal.inc({ result: 'success', instance: INSTANCE_ID });

  res.status(201).json({
    status: 'accepted',
    instance_id: INSTANCE_ID,
    run_id: runId,
    commit_sha: commitSha,
    received_at: new Date().toISOString()
  });
});

// Start Server
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [${INSTANCE_ID}] BlastRadius API listening on http://0.0.0.0:${PORT}`);
  });
}

module.exports = { app, redis, register };
