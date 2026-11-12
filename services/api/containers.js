const http = require('http');
const fs = require('fs');

const TARGET_SERVICES = [
  { service: 'api-1', container: 'blastradius-api-1' },
  { service: 'api-2', container: 'blastradius-api-2' },
  { service: 'api-3', container: 'blastradius-api-3' },
  { service: 'redis', container: 'blastradius-redis' },
  { service: 'nginx', container: 'blastradius-nginx' },
  { service: 'prometheus', container: 'blastradius-prometheus' },
  { service: 'grafana', container: 'blastradius-grafana' },
  { service: 'cadvisor', container: 'blastradius-cadvisor' }
];

/**
 * Normalizes a 1-minute CPU usage rate against the number of CPU cores.
 * @param {number} rate - The 1m CPU usage rate (seconds per second).
 * @param {number} [cores=1] - Number of available CPU cores.
 * @returns {number} CPU usage percentage normalized to [0, 100].
 */
function normalizeCpuRate(rate, cores = 1) {
  if (typeof rate !== 'number' || isNaN(rate) || rate < 0) return 0.0;
  const numCores = cores > 0 ? cores : 1;
  const pct = (rate / numCores) * 100.0;
  return parseFloat(pct.toFixed(2));
}

/**
 * Calculates CPU percentage from Docker stats structure.
 * Normalized by number of online CPU cores.
 * @param {object} stats - Docker container stats JSON.
 * @returns {number} CPU percentage.
 */
function calculateDockerCpuPercent(stats) {
  if (!stats || !stats.cpu_stats || !stats.precpu_stats) return 0.0;
  const cpuUsage = stats.cpu_stats.cpu_usage?.total_usage || 0;
  const preCpuUsage = stats.precpu_stats.cpu_usage?.total_usage || 0;
  const systemUsage = stats.cpu_stats.system_cpu_usage || 0;
  const preSystemUsage = stats.precpu_stats.system_cpu_usage || 0;

  const cpuDelta = cpuUsage - preCpuUsage;
  const systemDelta = systemUsage - preSystemUsage;

  if (systemDelta > 0 && cpuDelta >= 0) {
    const pct = (cpuDelta / systemDelta) * 100.0;
    return parseFloat(pct.toFixed(2));
  }
  return 0.0;
}

/**
 * Makes an HTTP GET request to the Docker UNIX socket.
 */
function dockerSocketRequest(path, socketPath = '/var/run/docker.sock', timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath,
        path,
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeout: timeoutMs
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (err) {
              reject(new Error(`Failed to parse Docker response from ${path}: ${err.message}`));
            }
          } else {
            const err = new Error(`Docker socket HTTP ${res.statusCode} for ${path}: ${data.trim()}`);
            err.statusCode = res.statusCode;
            reject(err);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Docker socket request timeout (${timeoutMs}ms) for ${path}`));
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Generic HTTP GET returning parsed JSON with timeout.
 */
function httpGetJson(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = http.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeout: timeoutMs
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode} from ${url}`));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`HTTP request timeout (${timeoutMs}ms) to ${url}`));
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetches metrics for all target containers via Docker Engine API over unix socket.
 */
async function fetchFromDockerSocket(socketPath) {
  const now = new Date().toISOString();

  const containerPromises = TARGET_SERVICES.map(async (target) => {
    try {
      const inspect = await dockerSocketRequest(`/containers/${target.container}/json`, socketPath, 3500);
      const isRunning = inspect.State?.Running === true;

      // Determine health
      let health = null;
      let health_reason = null;
      if (inspect.State?.Health?.Status) {
        health = inspect.State.Health.Status;
      } else if (isRunning) {
        health = 'healthy';
      } else {
        health = inspect.State?.Status || 'stopped';
      }

      const restart_count = inspect.RestartCount ?? 0;

      // Determine uptime
      let uptime_seconds = null;
      let uptime_seconds_reason = null;
      if (isRunning && inspect.State?.StartedAt) {
        const startMs = new Date(inspect.State.StartedAt).getTime();
        uptime_seconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      } else {
        uptime_seconds = null;
        uptime_seconds_reason = `container ${inspect.State?.Status || 'stopped'} (exit code ${inspect.State?.ExitCode ?? 0})`;
      }

      // Query stats if running
      let cpu_percent = null;
      let cpu_percent_reason = null;
      let memory_bytes = null;
      let memory_bytes_reason = null;

      if (isRunning) {
        try {
          const stats = await dockerSocketRequest(`/containers/${target.container}/stats?stream=false`, socketPath, 4000);
          cpu_percent = calculateDockerCpuPercent(stats);
          memory_bytes = stats.memory_stats?.usage || stats.memory_stats?.stats?.working_set || 0;
        } catch (err) {
          cpu_percent = null;
          cpu_percent_reason = `stats unavailable: ${err.message}`;
          memory_bytes = null;
          memory_bytes_reason = `stats unavailable: ${err.message}`;
        }
      } else {
        cpu_percent = null;
        cpu_percent_reason = `container not running (${inspect.State?.Status || 'stopped'})`;
        memory_bytes = null;
        memory_bytes_reason = `container not running (${inspect.State?.Status || 'stopped'})`;
      }

      return {
        service: target.service,
        container_name: target.container,
        cpu_percent,
        cpu_percent_reason,
        memory_bytes,
        memory_bytes_reason,
        health,
        health_reason,
        restart_count,
        restart_count_reason: null,
        uptime_seconds,
        uptime_seconds_reason,
        source: 'docker-api',
        collected_at: now
      };
    } catch (err) {
      return {
        service: target.service,
        container_name: target.container,
        cpu_percent: null,
        cpu_percent_reason: `inspect failed: ${err.message}`,
        memory_bytes: null,
        memory_bytes_reason: `inspect failed: ${err.message}`,
        health: null,
        health_reason: `inspect failed: ${err.message}`,
        restart_count: null,
        restart_count_reason: `inspect failed: ${err.message}`,
        uptime_seconds: null,
        uptime_seconds_reason: `inspect failed: ${err.message}`,
        source: 'unavailable',
        collected_at: now
      };
    }
  });

  const containers = await Promise.all(containerPromises);

  const by_service = {};
  for (const c of containers) {
    by_service[c.service] = c;
  }

  return {
    status: 'ok',
    source: 'docker-api',
    collected_at: now,
    containers,
    by_service
  };
}

/**
 * Fetches metrics from Prometheus as fallback if Docker socket is not available.
 * If Prometheus is also down, returns null with reason for all fields.
 */
async function fetchFromPrometheus(prometheusUrl) {
  const now = new Date().toISOString();
  const containers = [];

  let isPrometheusUp = false;
  let cpuMap = {};
  let memMap = {};
  let startMap = {};

  try {
    const url = `${prometheusUrl}/api/v1/query?query=container_cpu_usage_seconds_total`;
    const res = await httpGetJson(url, 2000);
    if (res.status === 'success') {
      isPrometheusUp = true;
      for (const item of (res.data?.result || [])) {
        const svc = item.metric.container_label_com_docker_compose_service || item.metric.name;
        if (svc) {
          cpuMap[svc] = parseFloat(item.value?.[1] || '0');
        }
      }
    }
  } catch {}

  if (isPrometheusUp) {
    try {
      const res = await httpGetJson(`${prometheusUrl}/api/v1/query?query=container_memory_working_set_bytes`, 2000);
      if (res.status === 'success') {
        for (const item of (res.data?.result || [])) {
          const svc = item.metric.container_label_com_docker_compose_service || item.metric.name;
          if (svc) {
            memMap[svc] = parseInt(item.value?.[1] || '0', 10);
          }
        }
      }
    } catch {}

    try {
      const res = await httpGetJson(`${prometheusUrl}/api/v1/query?query=container_start_time_seconds`, 2000);
      if (res.status === 'success') {
        for (const item of (res.data?.result || [])) {
          const svc = item.metric.container_label_com_docker_compose_service || item.metric.name;
          if (svc) {
            startMap[svc] = parseFloat(item.value?.[1] || '0');
          }
        }
      }
    } catch {}
  }

  for (const target of TARGET_SERVICES) {
    const hasPromMetrics = (target.service in cpuMap) || (target.service in memMap);

    if (hasPromMetrics) {
      const rate = cpuMap[target.service] || 0;
      const mem = memMap[target.service] || 0;
      const startSec = startMap[target.service];
      const uptime = startSec ? Math.max(0, Math.floor(Date.now() / 1000 - startSec)) : null;

      containers.push({
        service: target.service,
        container_name: target.container,
        cpu_percent: normalizeCpuRate(rate, 1),
        cpu_percent_reason: null,
        memory_bytes: mem,
        memory_bytes_reason: null,
        health: null,
        health_reason: 'requires Docker socket (cAdvisor does not report container health)',
        restart_count: null,
        restart_count_reason: 'requires Docker socket (cAdvisor does not report container restart count)',
        uptime_seconds: uptime,
        uptime_seconds_reason: uptime ? null : 'start time metric missing in Prometheus',
        source: 'prometheus',
        collected_at: now
      });
    } else {
      const reason = isPrometheusUp
        ? 'cAdvisor reports no per-container series on this host (WSL2 cgroup limitation)'
        : 'Prometheus unreachable and Docker socket unavailable';

      containers.push({
        service: target.service,
        container_name: target.container,
        cpu_percent: null,
        cpu_percent_reason: reason,
        memory_bytes: null,
        memory_bytes_reason: reason,
        health: null,
        health_reason: reason,
        restart_count: null,
        restart_count_reason: reason,
        uptime_seconds: null,
        uptime_seconds_reason: reason,
        source: 'unavailable',
        collected_at: now
      });
    }
  }

  const by_service = {};
  for (const c of containers) {
    by_service[c.service] = c;
  }

  const hasAny = containers.some(c => c.source === 'prometheus');

  return {
    status: 'ok',
    source: hasAny ? 'prometheus' : 'unavailable',
    collected_at: now,
    containers,
    by_service
  };
}

/**
 * Main coordinator function to retrieve container metrics.
 */
async function getContainersMetrics({
  redis = null,
  isRedisConnected = false,
  instanceId = 'api-1',
  prometheusUrl = process.env.PROMETHEUS_URL || 'http://prometheus:9090',
  dockerSocketPath = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
  forceRefresh = false
} = {}) {
  const cacheKey = 'blastradius:containers:all';

  // 1. Check Redis cache first (TTL 10s)
  if (!forceRefresh && isRedisConnected && redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        parsed.source = 'redis-cache';
        parsed.cached = true;
        parsed.instance_id = instanceId;
        return parsed;
      }
    } catch {}
  }

  let result = null;

  // 2. Check if Docker socket is available locally on this container (api-1)
  const isSocketAvailable = fs.existsSync(dockerSocketPath);
  if (isSocketAvailable) {
    try {
      result = await fetchFromDockerSocket(dockerSocketPath);
    } catch (err) {
      result = null;
    }
  }

  // 3. If Docker socket not available on this replica, attempt to query api-1
  if (!result && instanceId !== 'api-1') {
    try {
      result = await httpGetJson('http://api-1:4000/api/containers', 2500);
      if (result && result.containers) {
        result.instance_id = instanceId;
        return result;
      }
    } catch {}
  }

  // 4. Fallback to Prometheus
  if (!result) {
    result = await fetchFromPrometheus(prometheusUrl);
  }

  result.instance_id = instanceId;

  // 5. Cache result in Redis for 10 seconds if connected
  if (isRedisConnected && redis && result) {
    try {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', 10);
    } catch {}
  }

  return result;
}

module.exports = {
  TARGET_SERVICES,
  normalizeCpuRate,
  calculateDockerCpuPercent,
  fetchFromDockerSocket,
  fetchFromPrometheus,
  getContainersMetrics
};
