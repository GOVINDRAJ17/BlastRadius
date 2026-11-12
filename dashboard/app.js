/**
 * BlastRadius Dashboard - Interactive Graph & Metrics Visualization
 */

// Fallback baseline data if fetch fails (e.g. direct file:// opening)
const FALLBACK_GRAPH = {
  nodes: ["auth", "notifications", "payments", "search", "shared"],
  dependencies: {
    auth: ["shared"],
    notifications: ["payments", "shared"],
    payments: ["auth", "shared"],
    search: [],
    shared: []
  },
  reverseDependencies: {
    auth: ["payments"],
    notifications: [],
    payments: ["notifications"],
    search: [],
    shared: ["auth", "notifications", "payments"]
  }
};

const SCENARIOS = {
  current: null, // Will load from blast-radius.json
  auth_only: {
    name: "Scenario: 'auth' Changed",
    changed_files: ["services/auth/index.js"],
    changed_services: ["auth"],
    changed_infrastructure: [],
    directly_affected: ["auth"],
    transitively_affected: ["notifications", "payments"],
    tested: ["auth", "notifications", "payments"],
    to_build: ["auth", "notifications", "payments"],
    to_deploy: ["auth", "notifications", "payments"],
    skipped: ["search", "shared"],
    full_rebuild: false,
    full_rebuild_reason: null,
    causal_paths: {
      auth: ["auth"],
      payments: ["auth", "payments"],
      notifications: ["auth", "payments", "notifications"]
    },
    changedServices: ["auth"],
    affectedServices: ["auth", "notifications", "payments"],
    skippedServices: ["search", "shared"],
    totalServices: 5,
    explanations: {
      auth: "Directly modified in git diff (services/auth/index.js)",
      payments: "Tested transitively because payments -> auth (directly changed)",
      notifications: "Tested transitively because notifications -> payments -> auth (directly changed)"
    },
    metrics: {
      affectedCount: 3,
      skippedCount: 2,
      percentSaved: 40,
      estimatedTimeSavedMinutes: 5.0
    }
  },
  search_only: {
    name: "Scenario: 'search' Changed",
    changed_files: ["services/search/index.js"],
    changed_services: ["search"],
    changed_infrastructure: [],
    directly_affected: ["search"],
    transitively_affected: [],
    tested: ["search"],
    to_build: ["search"],
    to_deploy: ["search"],
    skipped: ["auth", "notifications", "payments", "shared"],
    full_rebuild: false,
    full_rebuild_reason: null,
    causal_paths: {
      search: ["search"]
    },
    changedServices: ["search"],
    affectedServices: ["search"],
    skippedServices: ["auth", "notifications", "payments", "shared"],
    totalServices: 5,
    explanations: {
      search: "Directly modified in git diff (services/search/index.js)"
    },
    metrics: {
      affectedCount: 1,
      skippedCount: 4,
      percentSaved: 80,
      estimatedTimeSavedMinutes: 10.0
    }
  },
  shared_only: {
    name: "Scenario: 'shared' Changed",
    changed_files: ["services/shared/index.js"],
    changed_services: ["shared"],
    changed_infrastructure: [],
    directly_affected: ["shared"],
    transitively_affected: ["auth", "notifications", "payments", "search"],
    tested: ["auth", "notifications", "payments", "search", "shared"],
    to_build: ["auth", "notifications", "payments", "search", "shared"],
    to_deploy: ["auth", "notifications", "payments", "search", "shared"],
    skipped: [],
    full_rebuild: true,
    full_rebuild_reason: "Shared core utility package was modified (full rebuild fallback)",
    causal_paths: {
      shared: ["shared"],
      auth: ["shared", "auth"],
      payments: ["shared", "payments"],
      notifications: ["shared", "notifications"],
      search: ["shared", "search"]
    },
    changedServices: ["shared"],
    affectedServices: ["auth", "notifications", "payments", "search", "shared"],
    skippedServices: [],
    totalServices: 5,
    explanations: {
      shared: "Directly modified in git diff (services/shared/index.js)",
      auth: "Included in full rebuild: Shared core utility package was modified",
      payments: "Included in full rebuild: Shared core utility package was modified",
      notifications: "Included in full rebuild: Shared core utility package was modified",
      search: "Included in full rebuild: Shared core utility package was modified"
    },
    metrics: {
      affectedCount: 5,
      skippedCount: 0,
      percentSaved: 0,
      estimatedTimeSavedMinutes: 0.0
    }
  },
  notifications_only: {
    name: "Scenario: 'notifications' Changed",
    changed_files: ["services/notifications/index.js"],
    changed_services: ["notifications"],
    changed_infrastructure: [],
    directly_affected: ["notifications"],
    transitively_affected: [],
    tested: ["notifications"],
    to_build: ["notifications"],
    to_deploy: ["notifications"],
    skipped: ["auth", "payments", "search", "shared"],
    full_rebuild: false,
    full_rebuild_reason: null,
    causal_paths: {
      notifications: ["notifications"]
    },
    changedServices: ["notifications"],
    affectedServices: ["notifications"],
    skippedServices: ["auth", "payments", "search", "shared"],
    totalServices: 5,
    explanations: {
      notifications: "Directly modified in git diff (services/notifications/index.js)"
    },
    metrics: {
      affectedCount: 1,
      skippedCount: 4,
      percentSaved: 80,
      estimatedTimeSavedMinutes: 10.0
    }
  }
};

/**
 * Non-runtime repository & VCS configuration files.
 * These files do not alter service binaries, test code, or container runtimes,
 * and must be excluded from "Directly Changed" counts and the CI status bar.
 */
const NON_RUNTIME_PATTERNS = new Set([
  'README.md',
  '.env.example',
  '.gitignore',
  '.gitattributes'
]);

/**
 * Unified CI compute savings formula.
 * Standard definition: saved = (5 - tested) * 2.5 min when affected > 0, otherwise 0 min / N/A.
 */
function computeSavings(testedCount, totalServices = 5) {
  if (testedCount === 0) {
    return {
      minutes: 0,
      percent: null,
      pctText: 'N/A',
      minsText: '0.0 mins (no tests required)'
    };
  }
  const savedCount = Math.max(0, totalServices - testedCount);
  const minutes = Number((savedCount * 2.5).toFixed(1));
  const percent = Math.round((savedCount / totalServices) * 100);
  return {
    minutes,
    percent,
    pctText: `~${percent}%`,
    minsText: `~${minutes.toFixed(1)} mins saved this run`
  };
}

const DOCKER_TEST_LOGS = {
  auth: {
    command: 'docker run --rm blastradius-auth:latest',
    badge: 'EXIT CODE: 0 (PASS)',
    badgeClass: 'pass',
    log: `[+] Building 0.8s (15/15) FINISHED                                           docker:desktop-linux
 => [internal] load build definition from Dockerfile                                         0.0s
 => [internal] load metadata for docker.io/library/node:22-alpine                            0.1s
 => CACHED [ 2/10] WORKDIR /app                                                              0.0s
 => CACHED [ 3/10] COPY services/shared/package.json ./services/shared/                      0.0s
 => CACHED [ 4/10] COPY services/auth/package.json ./services/auth/                          0.0s
 => CACHED [ 5/10] WORKDIR /app/services/auth                                                0.0s
 => CACHED [ 6/10] RUN npm install                                                           0.0s
 => CACHED [ 7/10] WORKDIR /app                                                              0.0s
 => CACHED [ 8/10] COPY services/shared/ ./services/shared/                                  0.0s
 => CACHED [ 9/10] COPY services/auth/ ./services/auth/                                      0.0s
 => CACHED [10/10] WORKDIR /app/services/auth                                                0.0s

TAP version 13
# Subtest: auth/generateToken creates valid token for valid user
ok 1 - auth/generateToken creates valid token for valid user
  ---
  duration_ms: 15.75113
  type: 'test'
  ...
# Subtest: auth/generateToken rejects invalid email
ok 2 - auth/generateToken rejects invalid email
  ---
  duration_ms: 0.532347
  type: 'test'
  ...
# Subtest: auth/verifyToken correctly validates token
ok 3 - auth/verifyToken correctly validates token
  ---
  duration_ms: 0.508823
  type: 'test'
  ...
# Subtest: auth/verifyToken rejects bad tokens
ok 4 - auth/verifyToken rejects bad tokens
  ---
  duration_ms: 0.248665
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 159.859389`
  },
  payments: {
    command: 'docker run --rm blastradius-payments:latest',
    badge: 'EXIT CODE: 0 (PASS)',
    badgeClass: 'pass',
    log: `[+] Building 0.5s (17/17) FINISHED                                           docker:desktop-linux
 => [internal] load build definition from Dockerfile                                         0.0s
 => CACHED [ 2/12] WORKDIR /app                                                              0.0s
 => CACHED [ 3/12] COPY services/shared/package.json ./services/shared/                      0.0s
 => CACHED [ 4/12] COPY services/auth/package.json ./services/auth/                          0.0s
 => CACHED [ 5/12] COPY services/payments/package.json ./services/payments/                  0.0s
 => CACHED [ 6/12] WORKDIR /app/services/payments                                            0.0s
 => CACHED [ 7/12] RUN npm install                                                           0.0s
 => CACHED [ 8/12] WORKDIR /app                                                              0.0s
 => CACHED [ 9/12] COPY services/shared/ ./services/shared/                                  0.0s
 => CACHED [10/12] COPY services/auth/ ./services/auth/                                      0.0s
 => CACHED [11/12] COPY services/payments/ ./services/payments/                              0.0s
 => CACHED [12/12] WORKDIR /app/services/payments                                            0.0s

TAP version 13
# Subtest: payments/processPayment succeeds with valid token and amount
ok 1 - payments/processPayment succeeds with valid token and amount
  ---
  duration_ms: 3.187724
  type: 'test'
  ...
# Subtest: payments/processPayment fails with invalid token
ok 2 - payments/processPayment fails with invalid token
  ---
  duration_ms: 0.331154
  type: 'test'
  ...
# Subtest: payments/processPayment fails with invalid amount
ok 3 - payments/processPayment fails with invalid amount
  ---
  duration_ms: 0.297392
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 134.787106`
  },
  notifications: {
    command: 'docker run --rm blastradius-notifications:latest',
    badge: 'EXIT CODE: 0 (PASS)',
    badgeClass: 'pass',
    log: `[+] Building 0.6s (19/19) FINISHED                                           docker:desktop-linux
 => [internal] load build definition from Dockerfile                                         0.0s
 => CACHED [ 2/14] WORKDIR /app                                                              0.0s
 => CACHED [ 3/14] COPY services/shared/package.json ./services/shared/                      0.0s
 => CACHED [ 4/14] COPY services/auth/package.json ./services/auth/                          0.0s
 => CACHED [ 5/14] COPY services/payments/package.json ./services/payments/                  0.0s
 => CACHED [ 6/14] COPY services/notifications/package.json ./services/notifications/        0.0s
 => CACHED [ 7/14] WORKDIR /app/services/notifications                                       0.0s
 => CACHED [ 8/14] RUN npm install                                                           0.0s
 => CACHED [ 9/14] WORKDIR /app                                                              0.0s
 => CACHED [10/14] COPY services/shared/ ./services/shared/                                  0.0s
 => CACHED [11/14] COPY services/auth/ ./services/auth/                                      0.0s
 => CACHED [12/14] COPY services/payments/ ./services/payments/                              0.0s
 => CACHED [13/14] COPY services/notifications/ ./services/notifications/                    0.0s
 => CACHED [14/14] WORKDIR /app/services/notifications                                       0.0s

TAP version 13
# Subtest: notifications/sendPaymentReceipt sends receipt for valid payload
ok 1 - notifications/sendPaymentReceipt sends receipt for valid payload
  ---
  duration_ms: 2.298359
  type: 'test'
  ...
# Subtest: notifications/sendPaymentReceipt rejects invalid email
ok 2 - notifications/sendPaymentReceipt rejects invalid email
  ---
  duration_ms: 0.307758
  type: 'test'
  ...
# Subtest: notifications/sendPaymentReceipt rejects missing transactionId
ok 3 - notifications/sendPaymentReceipt rejects missing transactionId
  ---
  duration_ms: 0.163595
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 108.670793`
  },
  shared: {
    command: 'docker run --rm blastradius-shared:latest',
    badge: 'EXIT CODE: 0 (PASS)',
    badgeClass: 'pass',
    log: `[+] Building 0.5s (10/10) FINISHED                                           docker:desktop-linux
 => [internal] load build definition from Dockerfile                                         0.0s
 => CACHED [2/5] WORKDIR /app/services/shared                                                0.0s
 => CACHED [3/5] COPY services/shared/package.json ./                                        0.0s
 => CACHED [4/5] RUN npm install                                                             0.0s
 => CACHED [5/5] COPY services/shared/ ./                                                    0.0s

TAP version 13
# Subtest: shared/formatCurrency formats numbers correctly
ok 1 - shared/formatCurrency formats numbers correctly
  ---
  duration_ms: 2.738249
  type: 'test'
  ...
# Subtest: shared/formatCurrency rejects invalid numbers
ok 2 - shared/formatCurrency rejects invalid numbers
  ---
  duration_ms: 0.706632
  type: 'test'
  ...
# Subtest: shared/validateEmail validates email addresses
ok 3 - shared/validateEmail validates email addresses
  ---
  duration_ms: 0.302075
  type: 'test'
  ...
# Subtest: shared/logger produces formatted log strings
ok 4 - shared/logger produces formatted log strings
  ---
  duration_ms: 0.770203
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 113.584169`
  },
  search: {
    command: 'docker run --rm blastradius-search:latest',
    badge: 'EXIT CODE: 0 (PASS)',
    badgeClass: 'pass',
    log: `[+] Building 0.5s (10/10) FINISHED                                           docker:desktop-linux
 => [internal] load build definition from Dockerfile                                         0.0s
 => CACHED [2/5] WORKDIR /app/services/search                                                0.0s
 => CACHED [3/5] COPY services/search/package.json ./                                        0.0s
 => CACHED [4/5] RUN npm install                                                             0.0s
 => CACHED [5/5] COPY services/search/ ./                                                    0.0s

TAP version 13
# Subtest: search/searchCatalog matches item names
ok 1 - search/searchCatalog matches item names
  ---
  duration_ms: 1.746451
  type: 'test'
  ...
# Subtest: search/searchCatalog matches tags
ok 2 - search/searchCatalog matches tags
  ---
  duration_ms: 0.228172
  type: 'test'
  ...
# Subtest: search/searchCatalog handles empty or null queries safely
ok 3 - search/searchCatalog handles empty or null queries safely
  ---
  duration_ms: 0.72439
  type: 'test'
  ...
# Subtest: search/getCatalogItem retrieves correct item
ok 4 - search/getCatalogItem retrieves correct item
  ---
  duration_ms: 0.210296
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 87.764565`
  }
};

let graphData = FALLBACK_GRAPH;
let currentBlastRadius = null;
let currentScopeData = null;
let historyData = null;
let network = null;

// Determine API base URL (supports local mode, ?api= query, or relative)
function getApiBaseUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramApi = urlParams.get('api');
  if (paramApi) return paramApi.replace(/\/$/, '');

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // If running under compose NGINX, proxy is at port 8080
    if (window.location.port === '8080') return '';
    return 'http://localhost:8080';
  }

  // Deployed production Vercel
  return '';
}

async function fetchJSON(relPath) {
  const t = Date.now();
  const candidates = [
    relPath,
    './' + relPath,
    relPath.startsWith('../') ? relPath.substring(3) : '../' + relPath,
    '/' + relPath.replace(/^(\.\.\/)+/, ''),
    'dashboard/' + relPath.replace(/^(\.\.\/)+/, '')
  ];

  for (const p of candidates) {
    try {
      const url = p.includes('?') ? `${p}&_t=${t}` : `${p}?_t=${t}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        return await res.json();
      }
    } catch {}
  }
  return null;
}

let isUIInitialized = false;

async function loadData() {
  try {
    const [graphRes, blastRes, histRes, scopeRes] = await Promise.all([
      fetchJSON('dependency-graph.json'),
      fetchJSON('blast-radius.json'),
      fetchJSON('metrics-history.json'),
      fetchJSON('deployment-scope.json')
    ]);

    if (graphRes) graphData = graphRes;
    if (blastRes) {
      currentBlastRadius = blastRes;
      SCENARIOS.current = blastRes;
    } else {
      currentBlastRadius = SCENARIOS.auth_only;
      SCENARIOS.current = SCENARIOS.auth_only;
    }
    if (histRes) historyData = histRes;
    if (scopeRes) currentScopeData = scopeRes;
  } catch (err) {
    console.warn('Using fallback simulation state:', err);
    currentBlastRadius = SCENARIOS.auth_only;
    SCENARIOS.current = SCENARIOS.auth_only;
  }

  if (!isUIInitialized) {
    initUI();
    setupLiveUpdates();
    isUIInitialized = true;
  } else {
    // If scenario selector is on "current", update currentBlastRadius to latest
    const select = document.getElementById('scenario-select');
    if (select && select.value === 'current' && SCENARIOS.current) {
      currentBlastRadius = SCENARIOS.current;
    }
  }

  renderGraph();
  renderStats();
  renderScopeContract();
  renderServiceList();
  renderOverviewChips();
  renderSavingsBaselineBar();
  renderPipelineStages();
  renderHistory();
  loadInfraStatus();
  loadContainerMetrics();

  const activeSvc = currentBlastRadius?.changedServices?.[0] || currentBlastRadius?.affectedServices?.[0] || 'auth';
  selectService(activeSvc);

  // Background fetch from Supabase ci-runs API (non-blocking)
  fetch('/api/ci-runs', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && Array.isArray(data.runs) && data.runs.length > 0) {
        if (!historyData) historyData = { runs: [], summary: {} };
        historyData.runs = data.runs;
        renderHistory();
      }
    })
    .catch(() => {});
}

// Render Phase 1 Deployment Scope Contract panel
function renderScopeContract() {
  const blast = currentBlastRadius || SCENARIOS.auth_only;
  const isSimulated = blast !== SCENARIOS.current;
  const scope = (isSimulated ? null : currentScopeData) || blast;

  // Application services only — strictly exclude cluster infrastructure ('api')
  const directlyChanged = (scope.changed_services || blast.changedServices || []).filter(s => s !== 'api');
  const directlyAffected = (scope.directly_affected || directlyChanged).filter(s => s !== 'api');
  const transitivelyAffected = (scope.transitively_affected || (blast.affectedServices || []).filter(s => !directlyChanged.includes(s))).filter(s => s !== 'api');
  const tested = (scope.tested || blast.affectedServices || []).filter(s => s !== 'api');
  const toBuild = (scope.to_build || tested).filter(s => s !== 'api');
  const toDeploy = (scope.to_deploy || tested).filter(s => s !== 'api');
  const skipped = (scope.skipped || blast.skippedServices || []).filter(s => s !== 'api');
  const fullRebuild = scope.full_rebuild ?? (blast.metrics?.percentSaved === 0 && blast.affectedServices?.length === 5);
  const rebuildReason = scope.full_rebuild_reason || (fullRebuild ? 'Core shared package or root manifest modified' : 'None');

  const badgeContract = document.getElementById('badge-contract-source');
  if (badgeContract) {
    if (isSimulated) {
      badgeContract.textContent = 'SEEDED';
      badgeContract.className = 'source-pill seeded';
    } else {
      badgeContract.textContent = 'LAST RUN';
      badgeContract.className = 'source-pill last-run';
    }
  }

  const elDirect = document.getElementById('scope-directly-changed');
  const elTrans = document.getElementById('scope-transitively-affected');
  const elTested = document.getElementById('scope-tested');
  const elBuild = document.getElementById('scope-to-build');
  const elDeploy = document.getElementById('scope-to-deploy');
  const elSkipped = document.getElementById('scope-skipped');
  const elRebuild = document.getElementById('scope-full-rebuild');
  const elReason = document.getElementById('scope-rebuild-reason');

  if (elDirect) elDirect.textContent = directlyChanged.length ? directlyChanged.join(', ') : 'None';
  if (elTrans) elTrans.textContent = transitivelyAffected.length ? transitivelyAffected.join(', ') : 'None';
  if (elTested) elTested.textContent = tested.length ? tested.join(', ') : 'None';
  if (elBuild) elBuild.textContent = toBuild.length ? toBuild.join(', ') : 'None';
  if (elDeploy) elDeploy.textContent = toDeploy.length ? toDeploy.join(', ') : 'None';
  if (elSkipped) elSkipped.textContent = skipped.length ? skipped.join(', ') : 'None';
  if (elRebuild) {
    elRebuild.textContent = fullRebuild ? 'TRUE' : 'FALSE';
    elRebuild.style.color = fullRebuild ? '#f87171' : '#34d399';
  }
  if (elReason) elReason.textContent = rebuildReason;
}

// Query infrastructure and replica status from local / remote API
async function loadInfraStatus() {
  const apiBase = getApiBaseUrl();
  const badgeApi = document.getElementById('badge-api-source');
  const countEl = document.getElementById('active-replica-count');
  const redisEl = document.getElementById('infra-redis-status');

  try {
    const res = await fetch(`${apiBase}/api/infra/status`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (badgeApi) {
        badgeApi.textContent = 'LIVE API (DOCKER)';
        badgeApi.className = 'source-pill live';
      }
      if (countEl) {
        countEl.textContent = `${data.active_replicas || 0}/${data.total_replicas || 3} active`;
      }
      if (redisEl) {
        redisEl.textContent = `Redis Distributed Cache: ${data.redis || 'connected'}`;
        redisEl.style.color = data.redis === 'connected' ? '#34d399' : '#f87171';
      }

      // Update replica badge pills
      (data.replicas || []).forEach(rep => {
        const el = document.getElementById(`rep-${rep.instance_id}`);
        if (el) {
          el.textContent = `${rep.instance_id}: ${rep.status.toUpperCase()}`;
          el.className = `replica-badge ${rep.status === 'healthy' ? 'healthy' : 'unhealthy'}`;
        }
      });

      // Update replica traffic distribution from live measurements
      const barContainer = document.getElementById('dist-bar-container');
      const talliesContainer = document.getElementById('traffic-distribution-tallies');
      const unavailEl = document.getElementById('traffic-distribution-unavailable');
      const sourceLabel = document.getElementById('lb-source-label');

      if (data.traffic) {
        if (sourceLabel) {
          sourceLabel.textContent = `(source: ${data.traffic.source || 'live counter'}, routes: ${data.traffic.counted_routes || '/api/*'})`;
        }

        const total = data.traffic.total || 0;
        const counts = data.traffic.counts || {};

        if (total === 0) {
          if (barContainer) barContainer.style.display = 'flex';
          if (talliesContainer) talliesContainer.style.display = 'flex';
          if (unavailEl) {
            unavailEl.style.display = 'block';
            unavailEl.style.color = '#94a3b8';
            unavailEl.textContent = 'no traffic yet (send requests to /api/*)';
          }
          ['api-1', 'api-2', 'api-3'].forEach(rep => {
            const bar = document.getElementById(`dist-${rep}`);
            const tally = document.getElementById(`tally-${rep}`);
            if (bar) bar.style.width = '0%';
            if (tally) tally.textContent = `${rep}: 0 (0%)`;
          });
        } else {
          if (barContainer) barContainer.style.display = 'flex';
          if (talliesContainer) talliesContainer.style.display = 'flex';
          if (unavailEl) unavailEl.style.display = 'none';

          ['api-1', 'api-2', 'api-3'].forEach(rep => {
            const count = counts[rep] || 0;
            const pct = Math.round((count / total) * 100);
            const bar = document.getElementById(`dist-${rep}`);
            const tally = document.getElementById(`tally-${rep}`);
            if (bar) {
              bar.style.width = `${pct}%`;
              bar.title = `${rep}: ${count} (${pct}%)`;
            }
            if (tally) {
              tally.textContent = `${rep}: ${count} (${pct}%)`;
            }
          });
        }

        const lbCard = document.querySelector('#tab-load-balancer .infra-card');
        if (lbCard) {
          lbCard.setAttribute('title',
            `[Source: LIVE]\n` +
            `Formula: traffic_share(api_i) = requests(api_i) / total_requests × 100%\n` +
            `Raw Inputs: api-1=${counts['api-1'] || 0}, api-2=${counts['api-2'] || 0}, api-3=${counts['api-3'] || 0}, total=${total}`
          );
        }
      }

      return;
    }
  } catch {}

  // If local API is offline, label accurately as UNAVAILABLE or LOCAL REPLICA
  if (badgeApi) {
    badgeApi.textContent = 'UNAVAILABLE (COMPOSE OFFLINE)';
    badgeApi.className = 'source-pill unavailable';
  }
  if (countEl) countEl.textContent = '0/3 active (start docker compose)';
  if (redisEl) redisEl.textContent = 'Redis Cache: start docker compose up -d';

  const barContainer = document.getElementById('dist-bar-container');
  const talliesContainer = document.getElementById('traffic-distribution-tallies');
  const unavailEl = document.getElementById('traffic-distribution-unavailable');
  if (barContainer) barContainer.style.display = 'none';
  if (talliesContainer) talliesContainer.style.display = 'none';
  if (unavailEl) {
    unavailEl.style.display = 'block';
    unavailEl.innerHTML = `
      <div class="empty-state" style="padding: 1rem 0.5rem;">
        <div class="empty-state-title" style="color: #f87171;">Traffic Distribution Unavailable</div>
        <div class="empty-state-desc">NGINX reverse proxy and API cluster are unreachable. Start the stack with:</div>
        <code class="empty-state-cmd">docker compose up -d</code>
      </div>
    `;
  }
}

// ============================================================================
// Real Container Metrics Handling (Phase 2 & Section 5)
// ============================================================================
let lastContainersData = null;

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

let currentContainerSort = { col: 'service', asc: true };
let currentContainerFilter = 'all';

function formatUptime(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds <= 0) return 'unavailable';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function filterContainers(status) {
  currentContainerFilter = status;
  const buttons = document.querySelectorAll('#container-status-filters .filter-btn');
  buttons.forEach(btn => {
    if (btn.textContent.toLowerCase().includes(status)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  updateSelectedContainerView();
}

function sortContainers(col) {
  if (currentContainerSort.col === col) {
    currentContainerSort.asc = !currentContainerSort.asc;
  } else {
    currentContainerSort.col = col;
    currentContainerSort.asc = true;
  }
  ['service', 'health', 'cpu', 'mem', 'restarts', 'uptime'].forEach(k => {
    const el = document.getElementById(`sort-${k}`);
    if (el) el.textContent = '';
  });
  const shortMap = { service: 'service', health: 'health', cpu_percent: 'cpu', memory_bytes: 'mem', restart_count: 'restarts', uptime_seconds: 'uptime' };
  const arrowEl = document.getElementById(`sort-${shortMap[col] || col}`);
  if (arrowEl) arrowEl.textContent = currentContainerSort.asc ? '▲' : '▼';

  updateSelectedContainerView();
}

function inspectContainerRow(serviceName) {
  const select = document.getElementById('container-select');
  if (select) {
    select.value = serviceName;
    updateSelectedContainerView();
  }
}

function updateSelectedContainerView() {
  if (!lastContainersData || !lastContainersData.containers) return;

  const select = document.getElementById('container-select');
  const selectedSvc = select ? select.value : 'all';
  const containers = lastContainersData.containers;

  const cpuEl = document.getElementById('cadvisor-cpu');
  const memEl = document.getElementById('cadvisor-mem');
  const healthEl = document.getElementById('cadvisor-health');
  const restartsEl = document.getElementById('cadvisor-restarts');
  const reasonEl = document.getElementById('container-reason-text');

  if (selectedSvc === 'all') {
    let totalCpu = 0;
    let totalMem = 0;
    let totalRestarts = 0;
    let healthyCount = 0;
    let anyCpuValid = false;
    let reasons = [];

    containers.forEach(c => {
      if (typeof c.cpu_percent === 'number') {
        totalCpu += c.cpu_percent;
        anyCpuValid = true;
      } else if (c.cpu_percent_reason) {
        reasons.push(`${c.service}: ${c.cpu_percent_reason}`);
      }
      if (typeof c.memory_bytes === 'number') totalMem += c.memory_bytes;
      if (typeof c.restart_count === 'number') totalRestarts += c.restart_count;
      if (c.health === 'healthy') healthyCount++;
    });

    if (cpuEl) {
      if (anyCpuValid) {
        cpuEl.textContent = `${totalCpu.toFixed(1)}%`;
        cpuEl.title = `Total across ${containers.length} containers`;
        cpuEl.style.color = '#f8fafc';
      } else {
        cpuEl.textContent = 'unavailable';
        cpuEl.title = reasons[0] || 'unavailable';
        cpuEl.style.color = '#94a3b8';
      }
    }

    if (memEl) {
      memEl.textContent = formatBytes(totalMem);
      memEl.title = `Total memory across ${containers.length} containers`;
      memEl.style.color = '#f8fafc';
    }

    if (healthEl) {
      if (healthyCount === containers.length && containers.length > 0) {
        healthEl.textContent = 'UP';
        healthEl.style.color = '#34d399';
        healthEl.title = `All ${containers.length} containers healthy`;
      } else {
        const unhealthy = containers
          .filter(c => c.health !== 'healthy')
          .map(c => `${c.service}: ${c.health || 'unhealthy'}`)
          .join(', ');
        healthEl.textContent = `${healthyCount}/${containers.length} UP`;
        healthEl.style.color = '#f87171';
        healthEl.title = `Unhealthy: ${unhealthy}`;
      }
    }

    if (restartsEl) {
      restartsEl.textContent = `${totalRestarts}`;
      restartsEl.title = `Total restarts across all containers`;
    }

    if (reasonEl) {
      if (reasons.length > 0 && !anyCpuValid) {
        reasonEl.style.display = 'block';
        reasonEl.textContent = reasons[0];
      } else {
        reasonEl.style.display = 'none';
      }
    }
  } else {
    const c = containers.find(item => item.service === selectedSvc);
    if (!c) return;

    if (cpuEl) {
      if (typeof c.cpu_percent === 'number') {
        cpuEl.textContent = `${c.cpu_percent.toFixed(2)}%`;
        cpuEl.title = `Normalized CPU usage`;
        cpuEl.style.color = '#f8fafc';
      } else {
        cpuEl.textContent = 'unavailable';
        cpuEl.title = c.cpu_percent_reason || 'unavailable';
        cpuEl.style.color = '#94a3b8';
      }
    }

    if (memEl) {
      if (typeof c.memory_bytes === 'number') {
        memEl.textContent = formatBytes(c.memory_bytes);
        memEl.title = `${c.memory_bytes} bytes`;
        memEl.style.color = '#f8fafc';
      } else {
        memEl.textContent = 'unavailable';
        memEl.title = c.memory_bytes_reason || 'unavailable';
        memEl.style.color = '#94a3b8';
      }
    }

    if (healthEl) {
      if (c.health === 'healthy') {
        healthEl.textContent = 'UP';
        healthEl.style.color = '#34d399';
        healthEl.title = 'healthy';
      } else {
        healthEl.textContent = (c.health || 'unhealthy').toUpperCase();
        healthEl.style.color = '#f87171';
        healthEl.title = c.health_reason || c.health || 'unhealthy';
      }
    }

    if (restartsEl) {
      if (typeof c.restart_count === 'number') {
        restartsEl.textContent = `${c.restart_count}`;
        restartsEl.title = `Container restarts`;
      } else {
        restartsEl.textContent = 'unavailable';
        restartsEl.title = c.restart_count_reason || 'unavailable';
      }
    }

    if (reasonEl) {
      const reason = c.cpu_percent_reason || c.health_reason || c.uptime_seconds_reason;
      if (reason && (c.cpu_percent === null || c.health !== 'healthy')) {
        reasonEl.style.display = 'block';
        reasonEl.textContent = reason;
      } else {
        reasonEl.style.display = 'none';
      }
    }
  }

  // Populate/update table with sorting, filtering, and row click inspection
  const tbody = document.getElementById('containers-table-body');
  if (tbody) {
    let displayed = [...containers];
    if (currentContainerFilter === 'healthy') {
      displayed = displayed.filter(c => c.health === 'healthy');
    } else if (currentContainerFilter === 'unhealthy') {
      displayed = displayed.filter(c => c.health !== 'healthy');
    }

    displayed.sort((a, b) => {
      let va = a[currentContainerSort.col];
      let vb = b[currentContainerSort.col];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (va < vb) return currentContainerSort.asc ? -1 : 1;
      if (va > vb) return currentContainerSort.asc ? 1 : -1;
      return 0;
    });

    tbody.innerHTML = displayed.map(c => {
      const isUp = c.health === 'healthy';
      const healthBadge = `<span style="color: ${isUp ? '#34d399' : '#f87171'}; font-weight: 600;">${isUp ? 'UP' : (c.health || 'unhealthy').toUpperCase()}</span>`;
      const cpuVal = typeof c.cpu_percent === 'number' ? `${c.cpu_percent.toFixed(1)}%` : '<span style="color:#64748b;" title="' + (c.cpu_percent_reason || '') + '">unavail</span>';
      const memVal = typeof c.memory_bytes === 'number' ? formatBytes(c.memory_bytes) : '<span style="color:#64748b;" title="' + (c.memory_bytes_reason || '') + '">unavail</span>';
      const restartsVal = typeof c.restart_count === 'number' ? c.restart_count : '-';
      const uptimeVal = formatUptime(c.uptime_seconds);
      const srcVal = `<span class="source-pill ${c.source === 'unavailable' ? 'unavailable' : 'live'}" style="font-size:0.65rem;">${c.source || 'docker-api'}</span>`;

      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); cursor: pointer;" onclick="inspectContainerRow('${c.service}')">
          <td style="padding: 6px 8px; font-weight: 600; color: #f1f5f9;">${c.service}</td>
          <td style="padding: 6px 8px;">${healthBadge}</td>
          <td style="padding: 6px 8px;">${cpuVal}</td>
          <td style="padding: 6px 8px;">${memVal}</td>
          <td style="padding: 6px 8px;">${restartsVal}</td>
          <td style="padding: 6px 8px; color: #94a3b8;">${uptimeVal}</td>
          <td style="padding: 6px 8px;">${srcVal}</td>
        </tr>
      `;
    }).join('');
  }
}

async function loadContainerMetrics() {
  const apiBase = getApiBaseUrl();
  const badgeSource = document.getElementById('badge-cadvisor-source');
  const statusText = document.getElementById('cadvisor-status-text');
  const contentEl = document.getElementById('container-metrics-content');
  const unavailEl = document.getElementById('container-metrics-unavailable');

  try {
    const res = await fetch(`${apiBase}/api/containers`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      lastContainersData = data;

      if (badgeSource) {
        const src = data.source || 'docker-api';
        badgeSource.textContent = `source: ${src}`;
        badgeSource.className = `source-pill ${src === 'unavailable' ? 'unavailable' : 'live'}`;
      }

      if (statusText) {
        const count = (data.containers || []).length;
        statusText.textContent = `${count} Compose Containers Monitored (${data.source || 'docker-api'})`;
      }

      if (contentEl) contentEl.style.display = 'block';
      if (unavailEl) unavailEl.style.display = 'none';

      const cardContainers = document.getElementById('card-container-metrics');
      if (cardContainers) {
        cardContainers.setAttribute('title',
          `[Source: LIVE]\n` +
          `Formula: Queried via Docker Engine API from /api/containers\n` +
          `Raw Inputs: ${(data.containers || []).length} Compose containers inspected`
        );
      }

      updateSelectedContainerView();
      return;
    }
  } catch {}

  // Offline / unreachable fallback
  if (badgeSource) {
    badgeSource.textContent = 'UNAVAILABLE';
    badgeSource.className = 'source-pill unavailable';
  }
  if (statusText) {
    statusText.textContent = 'Container metrics unavailable (start docker compose)';
  }
  if (contentEl) contentEl.style.display = 'none';
  if (unavailEl) {
    unavailEl.style.display = 'block';
    unavailEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🐳</div>
        <div class="empty-state-title">No containers reporting</div>
        <div class="empty-state-desc">Docker Engine telemetry is currently unavailable. Start the stack with:</div>
        <code class="empty-state-cmd">docker compose up -d</code>
      </div>
    `;
  }
}

function getNodeColor(svcName, blast) {
  const isChanged = blast.changedServices.includes(svcName);
  const isAffected = blast.affectedServices.includes(svcName);

  if (isChanged) {
    return {
      background: '#ef4444',
      border: '#b91c1c',
      highlight: { background: '#f87171', border: '#ef4444' }
    };
  }
  if (isAffected) {
    return {
      background: '#f59e0b',
      border: '#d97706',
      highlight: { background: '#fbbf24', border: '#f59e0b' }
    };
  }
  return {
    background: '#374151',
    border: '#4b5563',
    highlight: { background: '#4b5563', border: '#9ca3af' }
  };
}

function buildTooltip(svcName, blast) {
  const isChanged = blast.changedServices.includes(svcName);
  const isAffected = blast.affectedServices.includes(svcName);
  let statusBadge = '<span style="color:#9ca3af;font-weight:bold;">⚪ SKIPPED</span>';
  if (isChanged) statusBadge = '<span style="color:#f87171;font-weight:bold;">🔴 DIRECT CHANGE</span>';
  else if (isAffected) statusBadge = '<span style="color:#fbbf24;font-weight:bold;">🟠 TRANSITIVELY AFFECTED</span>';

  const explanation = blast.explanations?.[svcName] || 'No changes detected in this service or upstream dependencies.';
  const deps = graphData.dependencies?.[svcName] || [];
  const dependents = graphData.reverseDependencies?.[svcName] || [];

  return `
    <div style="font-size:12px;line-height:1.5;">
      <div style="font-weight:bold;font-size:14px;margin-bottom:4px;color:#fff;">${svcName}</div>
      <div style="margin-bottom:8px;">Status: ${statusBadge}</div>
      <div style="margin-bottom:6px;"><strong>Impact Reason:</strong><br/>${explanation}</div>
      <div style="font-size:11px;color:#9ca3af;border-top:1px solid #4b5563;padding-top:4px;margin-top:4px;">
        Depends on: ${deps.join(', ') || 'none'}<br/>
        Dependents: ${dependents.join(', ') || 'none'}
      </div>
    </div>
  `;
}

const NODE_POSITIONS = {
  shared:        { x: 0,    y: -140 },
  auth:          { x: -160, y: -20 },
  payments:      { x: -160, y: 100 },
  notifications: { x: 0,    y: 170 },
  search:        { x: 190,  y: 0 }
};

function renderSVGGraph(container, blast) {
  const nodes = graphData.nodes || Object.keys(graphData.dependencies || {});
  const edges = [];
  for (const [src, targets] of Object.entries(graphData.dependencies || {})) {
    for (const tgt of targets) {
      edges.push({ from: src, to: tgt });
    }
  }

  const svgCoords = {
    shared:        { x: 300, y: 80 },
    auth:          { x: 140, y: 190 },
    payments:      { x: 140, y: 310 },
    notifications: { x: 300, y: 420 },
    search:        { x: 470, y: 250 }
  };

  const edgeElements = edges.map(e => {
    const p1 = svgCoords[e.from] || { x: 200, y: 200 };
    const p2 = svgCoords[e.to] || { x: 200, y: 200 };
    const isActive = blast.affectedServices.includes(e.from) && blast.affectedServices.includes(e.to);
    const stroke = isActive ? '#f59e0b' : '#4b5563';
    const strokeWidth = isActive ? 2.5 : 1.5;
    const strokeDash = isActive ? 'none' : '4 4';
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    return `
      <g>
        <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="${strokeDash}" marker-end="url(#arrow-${isActive ? 'active' : 'dim'})" />
        <text x="${midX}" y="${midY - 4}" fill="#6b7280" font-size="9" text-anchor="middle" font-family="monospace">imports</text>
      </g>
    `;
  }).join('');

  const nodeElements = nodes.map(svc => {
    const pt = svgCoords[svc] || { x: 300, y: 250 };
    const isChanged = blast.changedServices.includes(svc);
    const isAffected = blast.affectedServices.includes(svc);
    const isSpecial = svc === 'shared';

    let fill = '#374151';
    let stroke = '#4b5563';
    let statusText = '[SKIP]';
    if (isChanged) {
      fill = '#ef4444';
      stroke = '#b91c1c';
      statusText = '[CHANGED]';
    } else if (isAffected) {
      fill = '#f59e0b';
      stroke = '#d97706';
      statusText = '[TEST]';
    }

    return `
      <g style="cursor: pointer;" onclick="selectService('${svc}')" transform="translate(${pt.x}, ${pt.y})">
        <rect x="-60" y="-26" width="120" height="52" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="${isSpecial ? 3 : 2}" filter="drop-shadow(0px 4px 10px rgba(0,0,0,0.5))" />
        <text x="0" y="-4" fill="#ffffff" font-weight="700" font-size="13" text-anchor="middle" font-family="'Inter', sans-serif">${isSpecial ? '★ ' : ''}${svc}</text>
        <text x="0" y="14" fill="#f3f4f6" font-weight="600" font-size="10" text-anchor="middle" font-family="'JetBrains Mono', monospace">${statusText}</text>
      </g>
    `;
  }).join('');

  container.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 600 500" style="display: block; background: transparent; width: 100%; height: 520px;">
      <defs>
        <marker id="arrow-active" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
        </marker>
        <marker id="arrow-dim" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#4b5563" />
        </marker>
      </defs>
      ${edgeElements}
      ${nodeElements}
    </svg>
  `;
}

function renderGraph() {
  const container = document.getElementById('network-container');
  if (!container) return;

  const blast = currentBlastRadius || SCENARIOS.auth_only;
  const affected = blast.affectedServices || [];
  const changed = blast.changedServices || [];

  // Check if vis library is loaded; if not, render responsive SVG fallback and schedule retry
  if (typeof vis === 'undefined' || !vis.Network) {
    console.warn('vis library not ready yet, rendering responsive SVG graph.');
    renderSVGGraph(container, blast);
    setTimeout(() => {
      if (typeof vis !== 'undefined' && vis.Network && !network) {
        renderGraph();
      }
    }, 400);
    return;
  }

  try {
    const nodes = (graphData.nodes || Object.keys(graphData.dependencies || {})).map(svc => {
      const isSpecial = svc === 'shared';
      const colors = getNodeColor(svc, blast);
      const isAffected = affected.includes(svc);
      const isChanged = changed.includes(svc);

      let label = `${svc}\n${isChanged ? '[CHANGED]' : isAffected ? '[TEST]' : '[SKIP]'}`;
      if (isSpecial) label = `★ ${label}`;

      return {
        id: svc,
        label: label,
        x: NODE_POSITIONS[svc]?.x ?? 0,
        y: NODE_POSITIONS[svc]?.y ?? 0,
        color: colors,
        shape: isSpecial ? 'hexagon' : 'box',
        margin: 12,
        font: {
          color: '#ffffff',
          face: 'Inter, sans-serif',
          size: 13,
          bold: true
        },
        borderWidth: isSpecial ? 3 : 2,
        shadow: {
          enabled: isAffected,
          color: isChanged ? 'rgba(239,68,68,0.6)' : 'rgba(245,158,11,0.6)',
          size: 14,
          x: 0,
          y: 0
        },
        title: buildTooltip(svc, blast)
      };
    });

    const edges = [];
    let edgeId = 1;
    for (const [source, depList] of Object.entries(graphData.dependencies || {})) {
      for (const target of depList) {
        const activePath = affected.includes(source) && affected.includes(target);

        edges.push({
          id: edgeId++,
          from: source,
          to: target,
          arrows: {
            to: { enabled: true, scaleFactor: 0.9 }
          },
          label: 'imports',
          font: { color: '#9ca3af', size: 10, align: 'middle' },
          color: {
            color: activePath ? '#f59e0b' : '#4b5563',
            highlight: '#818cf8',
            hover: '#93c5fd'
          },
          width: activePath ? 2.5 : 1.2,
          dashes: !activePath,
          smooth: { type: 'cubicBezier', roundness: 0.25 }
        });
      }
    }

    const data = {
      nodes: typeof vis.DataSet === 'function' ? new vis.DataSet(nodes) : nodes,
      edges: typeof vis.DataSet === 'function' ? new vis.DataSet(edges) : edges
    };

    const options = {
      autoResize: true,
      height: '520px',
      width: '100%',
      physics: {
        enabled: false // Static coordinates ensure instant, centered rendering
      },
      interaction: {
        hover: true,
        tooltipDelay: 100,
        zoomView: true,
        dragView: true,
        dragNodes: true,
        keyboard: false,
        selectable: true
      }
    };

    if (network) {
      try { network.destroy(); } catch {}
    }

    container.innerHTML = '';
    network = new vis.Network(container, data, options);

    network.on('click', function (params) {
      if (params.nodes && params.nodes.length > 0) {
        selectService(params.nodes[0]);
      }
    });

    // Re-fit canvas into view cleanly
    setTimeout(() => {
      if (network && typeof network.fit === 'function') {
        network.fit({ animation: false });
      }
    }, 60);

  } catch (err) {
    console.error('vis-network initialization error, falling back to SVG:', err);
    renderSVGGraph(container, blast);
  }
}

function zoomGraph(factor) {
  if (!network) return;
  const currentScale = network.getScale();
  network.moveTo({
    scale: currentScale * factor,
    animation: { duration: 200, easingFunction: 'easeInOutQuad' }
  });
}

function fitGraph() {
  if (!network) return;
  network.fit({
    animation: { duration: 300, easingFunction: 'easeInOutQuad' }
  });
}

function renderStats() {
  const blast = currentBlastRadius || SCENARIOS.auth_only;
  const isSimulated = blast !== SCENARIOS.current;

  // Filter out non-runtime repository & VCS configuration files
  const rawChangedFiles = blast.changedFiles || blast.changed_files || [];
  const runtimeFiles = rawChangedFiles.filter(f => {
    const base = f.split('/').pop().split('\\').pop();
    return !NON_RUNTIME_PATTERNS.has(base) && !NON_RUNTIME_PATTERNS.has(f);
  });

  const rawChanged = blast.changedServices || blast.changed_services || [];
  const changedServices = rawChanged.filter(s => s !== 'api');
  const rawAffected = blast.affectedServices || blast.tested || [];
  const affectedServices = rawAffected.filter(s => s !== 'api');
  const rawSkipped = blast.skippedServices || blast.skipped || [];
  const skippedServices = rawSkipped.filter(s => s !== 'api');

  const totalAppServices = 5;
  const testedCount = affectedServices.length;
  const savings = computeSavings(testedCount, totalAppServices);

  document.getElementById('stat-total').textContent = totalAppServices;
  document.getElementById('stat-changed').textContent = changedServices.length;
  document.getElementById('stat-affected').textContent = testedCount;
  document.getElementById('stat-skipped').textContent = skippedServices.length;
  document.getElementById('stat-saved').textContent = savings.pctText;
  document.getElementById('stat-saved-mins').textContent = savings.minsText;

  // Tooltips for 5 Stat Cards (Phase D: source label, exact formula, raw inputs)
  const sourceLabel = isSimulated ? 'SEEDED' : 'LAST RUN';
  const cardTotal = document.querySelector('.stat-card.total');
  const cardChanged = document.querySelector('.stat-card.changed');
  const cardAffected = document.querySelector('.stat-card.affected');
  const cardSkipped = document.querySelector('.stat-card.skipped');
  const cardSaved = document.querySelector('.stat-card.saved');

  if (cardTotal) {
    cardTotal.setAttribute('title',
      `[Source: ${sourceLabel}]\n` +
      `Formula: Monorepo application services count from AST topology\n` +
      `Raw Inputs: 5 discovered services [auth, notifications, payments, search, shared] (infrastructure excluded)`
    );
  }
  if (cardChanged) {
    cardChanged.setAttribute('title',
      `[Source: ${sourceLabel}]\n` +
      `Formula: git diff HEAD~1..HEAD matched to service boundaries (runtime files only)\n` +
      `Raw Inputs: changed_services: [${changedServices.join(', ') || 'none'}], changed_files: [${runtimeFiles.join(', ') || 'none'}]`
    );
  }
  if (cardAffected) {
    cardAffected.setAttribute('title',
      `[Source: ${sourceLabel}]\n` +
      `Formula: Blast radius = directly_affected ∪ transitive_callers(directly_affected)\n` +
      `Raw Inputs: directly_affected: [${changedServices.join(', ') || 'none'}], transitively_affected: [${affectedServices.filter(s => !changedServices.includes(s)).join(', ') || 'none'}], total tested: ${testedCount}`
    );
  }
  if (cardSkipped) {
    cardSkipped.setAttribute('title',
      `[Source: ${sourceLabel}]\n` +
      `Formula: Total application services (5) − tested (${testedCount})\n` +
      `Raw Inputs: skipped: [${skippedServices.join(', ') || 'none'}], count: ${skippedServices.length}`
    );
  }
  if (cardSaved) {
    cardSaved.setAttribute('title',
      `[Source: ${sourceLabel}]\n` +
      `Formula: when affected > 0: saved = (5 − tested) × 2.5 min; when affected == 0: 0 min (N/A)\n` +
      `Raw Inputs: tested: ${testedCount}, skipped: ${skippedServices.length}, baseline: 12.5m, saved: ${savings.minutes.toFixed(1)}m (${savings.pctText})`
    );
  }

  // Update Top Verdict Line (Phase B requirement 1: "N of 5 services tested, M skipped, ~X min saved.")
  const verdictEl = document.getElementById('verdict-text');
  const verdictSource = document.getElementById('verdict-source-badge');
  if (verdictEl) {
    if (testedCount === 0) {
      verdictEl.textContent = `0 of 5 services tested, 5 skipped, 0 min saved.`;
    } else {
      verdictEl.textContent = `${testedCount} of 5 services tested, ${skippedServices.length} skipped, ~${savings.minutes.toFixed(1)} min saved.`;
    }
  }
  if (verdictSource) {
    verdictSource.textContent = isSimulated ? 'SEEDED' : 'LAST RUN';
    verdictSource.className = `source-pill ${isSimulated ? 'seeded' : 'last-run'}`;
  }

  const savingsBarSource = document.getElementById('badge-savings-bar-source');
  if (savingsBarSource) {
    savingsBarSource.textContent = isSimulated ? 'SEEDED' : 'LAST RUN';
    savingsBarSource.className = `source-pill ${isSimulated ? 'seeded' : 'last-run'}`;
  }

  // Update Continuous Integration Banner
  const statusEl = document.getElementById('ci-status-text');
  const branchEl = document.getElementById('ci-branch-tag');
  const commitEl = document.getElementById('ci-commit-tag');
  const timeEl = document.getElementById('ci-time-tag');

  if (statusEl) {
    if (isSimulated) {
      statusEl.textContent = `[SEEDED FIXTURE] ${blast.name || 'Demo Scenario'}`;
    } else {
      const changedDesc = changedServices.length > 0 ? changedServices.join(', ') : 'None';
      const fileNames = runtimeFiles.map(f => f.split('/').pop().split('\\').pop()).join(', ');
      statusEl.textContent = `Analyzed change: [${changedDesc}] ${fileNames ? `via ${fileNames}` : '(no runtime changes)'}`;
    }
  }
  if (branchEl) {
    branchEl.textContent = isSimulated ? 'branch: simulation' : `branch: ${blast.branch || 'master'}`;
  }
  if (commitEl) {
    commitEl.textContent = isSimulated ? 'commit: fixture' : `commit: ${blast.commitSha || 'latest'}`;
  }
  if (timeEl) {
    if (isSimulated) {
      timeEl.textContent = 'fixture';
    } else if (blast.timestamp) {
      try {
        const dt = new Date(blast.timestamp);
        timeEl.textContent = dt.toLocaleTimeString();
      } catch {}
    }
  }
}

function renderServiceList() {
  const listEl = document.getElementById('service-list');
  const blast = currentBlastRadius || SCENARIOS.auth_only;
  const appServices = graphData.applicationServices || (graphData.nodes || []).filter(s => s !== 'api');
  const infraServices = graphData.infrastructureServices || ['api'];

  const renderItem = (svc, isInfra = false) => {
    const isChanged = blast.changedServices.includes(svc);
    const isAffected = blast.affectedServices.includes(svc);

    let badgeClass = 'skipped';
    let badgeText = 'Skipped';
    if (isInfra) {
      badgeClass = 'infra';
      badgeText = 'Cluster Infra';
    } else if (isChanged) {
      badgeClass = 'test';
      badgeText = 'Changed';
    } else if (isAffected) {
      badgeClass = 'transitive';
      badgeText = 'Affected';
    }

    return `
      <div class="service-row" onclick="selectService('${svc}')">
        <div class="service-info">
          <span class="service-name">${svc}</span>
          ${isInfra ? '<span style="font-size:0.7rem;color:#a78bfa;margin-left:6px;">[Cluster Host]</span>' : ''}
        </div>
        <span class="badge ${badgeClass}" style="${isInfra ? 'background:rgba(139,92,246,0.15);color:#c4b5fd;border:1px solid #8b5cf6;' : ''}">${badgeText}</span>
      </div>
    `;
  };

  listEl.innerHTML = `
    <div style="font-size:0.75rem;font-weight:600;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Application Services (${appServices.length})</div>
    ${appServices.map(svc => renderItem(svc, false)).join('')}
    <div style="font-size:0.75rem;font-weight:600;color:#94a3b8;margin-top:12px;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Infrastructure Services (${infraServices.length})</div>
    ${infraServices.map(svc => renderItem(svc, true)).join('')}
  `;
}

function selectService(svcName) {
  const blast = currentBlastRadius || SCENARIOS.auth_only;
  const isChanged = blast.changedServices.includes(svcName);
  const isAffected = blast.affectedServices.includes(svcName);
  const deps = graphData.dependencies?.[svcName] || [];
  const callers = graphData.reverseDependencies?.[svcName] || [];
  const explanation = blast.explanations?.[svcName] || 'Untouched in this change scope.';
  const pathSteps = blast.impactPaths?.[svcName] || (isChanged ? [svcName] : []);

  document.getElementById('inspector-name').textContent = svcName;
  document.getElementById('inspector-status').innerHTML = isChanged
    ? '<span class="badge test">Direct Change (Rebuild & Test)</span>'
    : isAffected
    ? '<span class="badge transitive">Transitively Affected (Rebuild & Test)</span>'
    : '<span class="badge skipped">Untouched (Safe to Skip)</span>';

  document.getElementById('inspector-reason').textContent = explanation;
  document.getElementById('inspector-deps').textContent = deps.length ? deps.join(', ') : 'None (Independent)';
  document.getElementById('inspector-callers').textContent = callers.length ? callers.join(', ') : 'None (Leaf Node)';

  const pathEl = document.getElementById('inspector-path');
  if (pathSteps.length > 1) {
    pathEl.style.display = 'block';
    pathEl.textContent = `Blast Propagation: ${pathSteps.join(' ➔ ')}`;
  } else if (isChanged) {
    pathEl.style.display = 'block';
    pathEl.textContent = `Root Origin of Change: ${svcName}`;
  } else {
    pathEl.style.display = 'none';
  }

  // Highlight in vis-network without stealing scroll
  if (network && typeof network.selectNodes === 'function') {
    try {
      network.selectNodes([svcName]);
    } catch {}
  }

  // Trigger pulse highlight animation on inspector side-card
  const inspectorCard = document.getElementById('service-inspector-card');
  if (inspectorCard) {
    inspectorCard.classList.remove('inspector-highlight');
    void inspectorCard.offsetWidth; // Trigger reflow
    inspectorCard.classList.add('inspector-highlight');
  }

  // Also switch test log tab to this service if available
  if (DOCKER_TEST_LOGS[svcName]) {
    switchLogTab(svcName);
  }
}

function switchLogTab(svcName) {
  const logData = DOCKER_TEST_LOGS[svcName];

  // Update tabs active state
  const tabs = document.querySelectorAll('#log-tabs .tab-btn');
  tabs.forEach(btn => {
    if (btn.textContent.startsWith(svcName)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const titleEl = document.getElementById('terminal-title');
  const badgeEl = document.getElementById('terminal-badge');
  const outputEl = document.getElementById('terminal-output');

  if (logData) {
    if (titleEl) titleEl.textContent = logData.command;
    if (badgeEl) badgeEl.textContent = `${logData.badge} [SEEDED]`;
    if (outputEl) outputEl.textContent = logData.log;
  } else {
    if (titleEl) titleEl.textContent = `docker run --rm blastradius-${svcName}:latest`;
    if (badgeEl) badgeEl.textContent = 'NO CAPTURE';
    if (outputEl) outputEl.textContent = 'No run output captured for this run.';
  }
}

function filterHistory() {
  const input = document.getElementById('history-branch-filter');
  const query = (input?.value || '').toLowerCase().trim();
  renderHistory(query);
}

function renderHistory(filterBranch = '') {
  const tbody = document.getElementById('history-table-body');
  const isFromApi = Boolean(historyData?.source === 'redis-cache' || historyData?.source === 'local-file');
  let runs = historyData?.runs || [
    {
      prNumber: 104,
      branch: 'perf/email-digest',
      commitSha: '1a9f0e2',
      changedServices: ['notifications'],
      affectedServices: ['notifications'],
      tested: ['notifications'],
      source: 'SEEDED'
    },
    {
      prNumber: 103,
      branch: 'feature/payment-webhook',
      commitSha: '7e1d5a8',
      changedServices: ['payments'],
      affectedServices: ['notifications', 'payments'],
      tested: ['notifications', 'payments'],
      source: 'SEEDED'
    },
    {
      prNumber: 102,
      branch: 'fix/token-expiry',
      commitSha: '3c8e4d1',
      changedServices: ['auth'],
      affectedServices: ['auth', 'notifications', 'payments'],
      tested: ['auth', 'notifications', 'payments'],
      source: 'SEEDED'
    },
    {
      prNumber: 101,
      branch: 'feature/search-filter',
      commitSha: '9f2a1b4',
      changedServices: ['search'],
      affectedServices: ['search'],
      tested: ['search'],
      source: 'SEEDED'
    }
  ];

  if (filterBranch) {
    runs = runs.filter(r => (r.branch || '').toLowerCase().includes(filterBranch));
  }

  if (runs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="padding: 2.5rem 1rem;">
          <div class="empty-state">
            <div class="empty-state-icon">📈</div>
            <div class="empty-state-title">No matching CI runs found</div>
            <div class="empty-state-desc">No recorded runs match this branch filter. Clear the search input or run:</div>
            <code class="empty-state-cmd">npm test</code>
          </div>
        </td>
      </tr>
    `;
    const cumEl = document.getElementById('cumulative-saved-text');
    if (cumEl) {
      cumEl.textContent = `Total Cumulative Savings: 0.0 CI minutes (0 runs)`;
    }
    return;
  }

  tbody.innerHTML = runs.map(r => {
    const rawTested = r.tested || r.affectedServices || [];
    const appTested = rawTested.filter(s => s !== 'api');
    const testedCount = appTested.length;
    const skippedCount = Math.max(0, 5 - testedCount);
    const savings = computeSavings(testedCount, 5);
    const rowSource = r.source || (isFromApi ? 'LIVE' : 'SEEDED');
    const pillClass = rowSource === 'LIVE' ? 'live' : 'seeded';

    return `
      <tr>
        <td><span class="source-pill ${pillClass}">${rowSource}</span></td>
        <td><span class="commit-tag">#${r.prNumber || 'push'}</span></td>
        <td><code>${r.branch || 'main'}</code></td>
        <td><span class="commit-tag clickable-copy" onclick="copyToClipboard('${r.commitSha || 'local'}', this, '${r.commitSha || 'local'}')" title="Click to copy commit SHA">${r.commitSha || 'local'}</span></td>
        <td><code>${(r.changedServices || []).filter(s => s !== 'api').join(', ') || 'none'}</code></td>
        <td><strong style="color:#fbbf24;">${testedCount}</strong></td>
        <td><strong style="color:#38bdf8;">${skippedCount}</strong></td>
        <td><span style="color:#10b981;font-weight:bold;">${savings.pctText}</span></td>
        <td><strong>+${savings.minutes.toFixed(1)}m</strong></td>
      </tr>
    `;
  }).join('');

  // The cumulative total MUST be computed strictly from the rows shown
  const cumulativeMinutes = runs.reduce((acc, r) => {
    const rawTested = r.tested || r.affectedServices || [];
    const appTested = rawTested.filter(s => s !== 'api');
    return acc + computeSavings(appTested.length, 5).minutes;
  }, 0);

  const cumEl = document.getElementById('cumulative-saved-text');
  if (cumEl) {
    cumEl.textContent = `Total Cumulative Savings: ~${cumulativeMinutes.toFixed(1)} CI minutes saved across ${runs.length} runs`;
    cumEl.setAttribute('title',
      `[Source: ${isFromApi ? 'LIVE' : 'SEEDED'}]\n` +
      `Formula: cumulative_saved = Σ ((5 − tested_i) × 2.5 min)\n` +
      `Raw Inputs: ${runs.length} runs displayed, sum = ${cumulativeMinutes.toFixed(1)} min`
    );
  }
}

function renderOverviewChips() {
  const container = document.getElementById('overview-service-chips');
  if (!container) return;

  const blast = currentBlastRadius || SCENARIOS.auth_only;
  const appServices = ['auth', 'notifications', 'payments', 'search', 'shared'];
  const changed = (blast.changedServices || blast.changed_services || []).filter(s => s !== 'api');
  const tested = (blast.affectedServices || blast.tested || []).filter(s => s !== 'api');

  container.innerHTML = appServices.map(svc => {
    const isDirect = changed.includes(svc);
    const isTested = tested.includes(svc);
    let badgeText = 'SKIP';
    let badgeStyle = 'background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3);';
    if (isDirect) {
      badgeText = 'TEST (CHANGED)';
      badgeStyle = 'background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4);';
    } else if (isTested) {
      badgeText = 'TEST';
      badgeStyle = 'background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4);';
    }

    const reason = blast.explanations?.[svc] || (isDirect ? 'Directly modified in git diff' : isTested ? 'Transitively affected' : 'Untouched (Safe to skip)');

    return `
      <div class="service-chip" onclick="selectServiceAndInspect('${svc}')">
        <div class="service-chip-header">
          <span class="service-chip-name">${svc}</span>
          <span class="badge" style="${badgeStyle}; font-size: 0.68rem; padding: 0.15rem 0.45rem;">${badgeText}</span>
        </div>
        <div class="service-chip-desc">${reason}</div>
      </div>
    `;
  }).join('');
}

function selectServiceAndInspect(svc) {
  selectService(svc);
  switchTab('scope');
  const inspectorCard = document.getElementById('service-inspector-card');
  if (inspectorCard) {
    inspectorCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function renderSavingsBaselineBar() {
  const blast = currentBlastRadius || SCENARIOS.auth_only;
  const tested = (blast.affectedServices || blast.tested || []).filter(s => s !== 'api');
  const testedCount = tested.length;
  const total = 5;
  const savings = computeSavings(testedCount, total);

  const testedMins = Number((testedCount * 2.5).toFixed(1));
  const savedMins = savings.minutes;

  const testedPct = Math.round((testedCount / total) * 100);
  const savedPct = 100 - testedPct;

  const barTested = document.getElementById('savings-bar-tested');
  const barSaved = document.getElementById('savings-bar-saved');
  const lblTested = document.getElementById('savings-bar-tested-label');
  const lblSaved = document.getElementById('savings-bar-saved-label');

  if (barTested) barTested.style.width = `${testedPct}%`;
  if (barSaved) barSaved.style.width = `${savedPct}%`;
  if (lblTested) lblTested.textContent = `Tested: ${testedMins}m (${testedCount}/5)`;
  if (lblSaved) lblSaved.textContent = `Skipped (Saved): ${savedMins}m (${total - testedCount}/5)`;

  const baselineCard = document.querySelector('.savings-baseline-card');
  if (baselineCard) {
    const isSimulated = blast !== SCENARIOS.current;
    const sourceLabel = isSimulated ? 'SEEDED' : 'LAST RUN';
    baselineCard.setAttribute('title',
      `[Source: ${sourceLabel}]\n` +
      `Formula: Baseline = 5 services × 2.5 min = 12.5 min\n` +
      `Tested: ${testedCount} × 2.5 min = ${testedMins}m | Skipped: ${total - testedCount} × 2.5 min = ${savedMins}m`
    );
  }
}

function renderPipelineStages() {
  const container = document.getElementById('pipeline-stages-container');
  if (!container) return;

  const blast = currentBlastRadius || SCENARIOS.auth_only;
  const changedFiles = blast.changedFiles || blast.changed_files || [];
  const changedServices = (blast.changedServices || blast.changed_services || []).filter(s => s !== 'api');
  const tested = (blast.affectedServices || blast.tested || []).filter(s => s !== 'api');
  const skipped = (blast.skippedServices || blast.skipped || []).filter(s => s !== 'api');
  const toBuild = tested;
  const toDeploy = tested;

  const stages = [
    {
      num: 'STAGE 1',
      title: '📁 Changed Files',
      count: `${changedFiles.length} file(s)`,
      status: changedFiles.length > 0 ? 'success' : 'skipped',
      statusText: changedFiles.length > 0 ? 'DETECTED' : 'CLEAN',
      detail: changedFiles.map(f => f.split('/').pop().split('\\').pop()).join(', ') || 'None'
    },
    {
      num: 'STAGE 2',
      title: '🔍 AST Analysis',
      count: '5 App Services',
      status: 'success',
      statusText: 'PARSED',
      detail: 'auth, notifications, payments, search, shared'
    },
    {
      num: 'STAGE 3',
      title: '📋 Scope Contract',
      count: `${tested.length} Tested / ${skipped.length} Skipped`,
      status: 'success',
      statusText: 'RESOLVED',
      detail: `Tested: [${tested.join(', ')}] | Skipped: [${skipped.join(', ')}]`
    },
    {
      num: 'STAGE 4',
      title: '🧪 Test Matrix',
      count: `${tested.length} Matrix Job(s)`,
      status: tested.length > 0 ? 'success' : 'skipped',
      statusText: tested.length > 0 ? 'EXECUTED' : 'SKIPPED',
      detail: tested.length > 0 ? tested.join(', ') : 'No test jobs needed'
    },
    {
      num: 'STAGE 5',
      title: '🐳 Docker Build',
      count: `${toBuild.length} Image(s)`,
      status: toBuild.length > 0 ? 'success' : 'skipped',
      statusText: toBuild.length > 0 ? 'BUILT' : 'SKIPPED',
      detail: toBuild.length > 0 ? toBuild.map(s => `blastradius-${s}`).join(', ') : 'No images to build'
    },
    {
      num: 'STAGE 6',
      title: '🚀 Deploy Scope',
      count: `${toDeploy.length} Service(s)`,
      status: toDeploy.length > 0 ? 'success' : 'skipped',
      statusText: toDeploy.length > 0 ? 'TARGETED' : 'SKIPPED',
      detail: toDeploy.length > 0 ? toDeploy.join(', ') : 'None'
    }
  ];

  container.innerHTML = stages.map(st => `
    <div class="pipeline-stage" title="${st.detail}">
      <div class="pipeline-stage-num">${st.num}</div>
      <div class="pipeline-stage-title">${st.title}</div>
      <div class="pipeline-stage-count">${st.count}</div>
      <span class="pipeline-stage-status ${st.status}">${st.statusText}</span>
    </div>
  `).join('');
}

function switchTab(tabId) {
  const validTabs = ['overview', 'scope', 'pipeline', 'containers', 'load-balancer', 'history'];
  const activeTab = validTabs.includes(tabId) ? tabId : 'overview';

  document.querySelectorAll('.tab-link').forEach(btn => {
    if (btn.getAttribute('data-tab') === activeTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.tab-pane').forEach(pane => {
    if (pane.id === `tab-${activeTab}`) {
      pane.classList.add('active');
      pane.style.display = 'block';
    } else {
      pane.classList.remove('active');
      pane.style.display = 'none';
    }
  });

  if (window.location && window.location.hash !== `#${activeTab}`) {
    if (window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, null, `#${activeTab}`);
    }
  }

  if (activeTab === 'scope') {
    setTimeout(() => {
      if (network && typeof network.fit === 'function') {
        network.fit({ animation: false });
      }
    }, 60);
  }
}

function initTabs() {
  const hash = window.location.hash.replace(/^#/, '');
  switchTab(hash || 'overview');

  window.addEventListener('hashchange', () => {
    const newHash = window.location.hash.replace(/^#/, '');
    switchTab(newHash || 'overview');
  });
}

function initUI() {
  initTabs();
  setupKeyboardShortcuts();

  const select = document.getElementById('scenario-select');
  select.addEventListener('change', (e) => {
    const key = e.target.value;
    if (SCENARIOS[key]) {
      currentBlastRadius = SCENARIOS[key];
    } else if (key === 'current' && SCENARIOS.current) {
      currentBlastRadius = SCENARIOS.current;
    }
    renderGraph();
    renderStats();
    renderScopeContract();
    renderServiceList();
    renderOverviewChips();
    renderSavingsBaselineBar();
    renderPipelineStages();
    const firstSvc = currentBlastRadius.changedServices[0] || currentBlastRadius.affectedServices[0] || 'auth';
    selectService(firstSvc);
  });

  // Select first service by default without auto-scrolling
  const defaultSvc = currentBlastRadius?.changedServices?.[0] || 'auth';
  selectService(defaultSvc);

  // Container metrics selector change listener
  const containerSelect = document.getElementById('container-select');
  if (containerSelect) {
    containerSelect.addEventListener('change', () => {
      updateSelectedContainerView();
    });
  }
}

function copyToClipboard(text, element, defaultText = null) {
  if (!text) return;
  const doFeedback = () => {
    if (!element) return;
    const orig = defaultText !== null ? defaultText : element.textContent;
    element.textContent = '✓ Copied';
    element.classList.add('copied');
    setTimeout(() => {
      element.textContent = orig;
      element.classList.remove('copied');
    }, 1800);
  };

  const nav = (typeof window !== 'undefined' && window.navigator) || (typeof navigator !== 'undefined' && navigator);
  if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    nav.clipboard.writeText(text).then(doFeedback).catch(() => {
      fallbackCopy(text, doFeedback);
    });
  } else {
    fallbackCopy(text, doFeedback);
  }
}

function fallbackCopy(text, cb) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (cb) cb();
  } catch (err) {
    console.warn('Copy failed:', err);
  }
}

function copyCommitTag(el) {
  const blast = currentBlastRadius || SCENARIOS.auth_only;
  const sha = blast.commitSha || (el ? el.textContent.replace(/^commit:\s*/, '') : 'latest');
  copyToClipboard(sha, el, el ? el.textContent : null);
}

function copyDockerCommand(btn) {
  const titleEl = document.getElementById('terminal-title');
  const cmd = titleEl ? titleEl.textContent.trim() : '';
  if (cmd) {
    copyToClipboard(cmd, btn, '📋 Copy');
  }
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const isInputActive = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

    if (e.key === 'Escape') {
      if (document.activeElement && document.activeElement !== document.body) {
        const active = document.activeElement;
        if (active.id === 'history-branch-filter') {
          active.value = '';
          filterHistory();
        }
        active.blur();
      }
      return;
    }

    if (isInputActive) return;

    switch (e.key) {
      case '1':
        e.preventDefault();
        switchTab('overview');
        break;
      case '2':
        e.preventDefault();
        switchTab('scope');
        break;
      case '3':
        e.preventDefault();
        switchTab('pipeline');
        break;
      case '4':
        e.preventDefault();
        switchTab('containers');
        break;
      case '5':
        e.preventDefault();
        switchTab('load-balancer');
        break;
      case '6':
        e.preventDefault();
        switchTab('history');
        break;
      case '/':
        e.preventDefault();
        switchTab('history');
        const filterInput = document.getElementById('history-branch-filter');
        if (filterInput) {
          filterInput.focus();
          filterInput.select();
        }
        break;
      case 'r':
      case 'R':
        e.preventDefault();
        if (typeof window.refreshDashboard === 'function') {
          window.refreshDashboard();
        }
        break;
      default:
        break;
    }
  });
}

function setupLiveUpdates() {
  if (typeof EventSource !== 'undefined') {
    try {
      const es = new EventSource('/api/live');
      es.addEventListener('update', (e) => {
        console.log('⚡ Received live code update from BlastRadius server:', e.data);
        loadData();
      });
      es.onerror = () => {
        // Fallback for static servers like Vercel where SSE endpoint is not available
      };
    } catch {}
  }
}

async function refreshDashboard() {
  const btn = document.getElementById('btn-refresh');
  const originalHtml = btn ? btn.innerHTML : '↻ Refresh <kbd class="btn-kbd">r</kbd>';
  if (btn) btn.innerHTML = '⏳ Refreshing...';

  try {
    await fetch('/api/refresh', { method: 'POST' }).catch(() => {});
  } catch {}

  await loadData();

  if (btn) {
    btn.innerHTML = '✓ Updated!';
    setTimeout(() => {
      btn.innerHTML = originalHtml;
    }, 1000);
  }
}

// Global exposure for HTML onclick handlers
window.zoomGraph = zoomGraph;
window.fitGraph = fitGraph;
window.switchLogTab = switchLogTab;
window.selectService = selectService;
window.refreshDashboard = refreshDashboard;
window.switchTab = switchTab;
window.selectServiceAndInspect = selectServiceAndInspect;
window.filterContainers = filterContainers;
window.sortContainers = sortContainers;
window.inspectContainerRow = inspectContainerRow;
window.filterHistory = filterHistory;
window.copyToClipboard = copyToClipboard;
window.copyCommitTag = copyCommitTag;
window.copyDockerCommand = copyDockerCommand;

// Auto-recheck on window focus when user switches back to browser tab
window.addEventListener('focus', () => {
  loadData();
});

window.addEventListener('DOMContentLoaded', loadData);
