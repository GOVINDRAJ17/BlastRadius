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
let historyData = null;
let network = null;

async function fetchJSON(relPath) {
  const candidates = [
    relPath,
    relPath.startsWith('../') ? relPath.substring(3) : '../' + relPath,
    '/' + relPath.replace(/^(\.\.\/)+/, '')
  ];

  for (const p of candidates) {
    try {
      const res = await fetch(p);
      if (res.ok) {
        return await res.json();
      }
    } catch {}
  }
  return null;
}

async function loadData() {
  try {
    const [graphRes, blastRes, histRes] = await Promise.all([
      fetchJSON('dependency-graph.json'),
      fetchJSON('blast-radius.json'),
      fetchJSON('metrics-history.json')
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
  } catch (err) {
    console.warn('Using fallback simulation state:', err);
    currentBlastRadius = SCENARIOS.auth_only;
    SCENARIOS.current = SCENARIOS.auth_only;
  }

  initUI();
  renderGraph();
  renderStats();
  renderServiceList();
  renderHistory();
  switchLogTab('auth');
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

  // Check if vis library is loaded; if not, render SVG fallback
  if (typeof vis === 'undefined' || !vis.Network) {
    console.warn('vis library not ready, rendering responsive SVG graph fallback.');
    renderSVGGraph(container, blast);
    return;
  }

  try {
    const nodes = (graphData.nodes || Object.keys(graphData.dependencies || {})).map(svc => {
      const isSpecial = svc === 'shared';
      const colors = getNodeColor(svc, blast);
      const isAffected = blast.affectedServices.includes(svc);
      const isChanged = blast.changedServices.includes(svc);

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
        const activePath = blast.affectedServices.includes(source) && blast.affectedServices.includes(target);

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
      nodes: new vis.DataSet(nodes),
      edges: new vis.DataSet(edges)
    };

    const options = {
      autoResize: true,
      height: '520px',
      width: '100%',
      physics: {
        enabled: false // Static coordinates ensure instant, rock-solid, centered rendering
      },
      interaction: {
        hover: true,
        tooltipDelay: 100,
        zoomView: false, // Prevents mouse wheel from trapping or hijacking page scroll!
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

    // Re-fit canvas into view cleanly without jumping scroll
    setTimeout(() => {
      if (network) {
        network.fit({ animation: false });
      }
    }, 50);

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
  const metrics = blast.metrics || {};

  document.getElementById('stat-total').textContent = blast.totalServices || 5;
  document.getElementById('stat-changed').textContent = blast.changedServices?.length || 0;
  document.getElementById('stat-affected').textContent = blast.affectedServices?.length || 0;
  document.getElementById('stat-skipped').textContent = blast.skippedServices?.length || 0;
  document.getElementById('stat-saved').textContent = `~${metrics.percentSaved || 0}%`;
  document.getElementById('stat-saved-mins').textContent = `~${metrics.estimatedTimeSavedMinutes || 0} mins saved this run`;
}

function renderServiceList() {
  const listEl = document.getElementById('service-list');
  const blast = currentBlastRadius || SCENARIOS.auth_only;
  const services = graphData.nodes || Object.keys(graphData.dependencies);

  listEl.innerHTML = services.map(svc => {
    const isChanged = blast.changedServices.includes(svc);
    const isAffected = blast.affectedServices.includes(svc);

    let badgeClass = 'skipped';
    let badgeText = 'Skipped';
    if (isChanged) {
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
        </div>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
    `;
  }).join('');
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
  if (network) {
    network.selectNodes([svcName]);
  }

  // Also switch test log tab to this service if available
  if (DOCKER_TEST_LOGS[svcName]) {
    switchLogTab(svcName);
  }
}

function switchLogTab(svcName) {
  const logData = DOCKER_TEST_LOGS[svcName];
  if (!logData) return;

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

  if (titleEl) titleEl.textContent = logData.command;
  if (badgeEl) badgeEl.textContent = logData.badge;
  if (outputEl) outputEl.textContent = logData.log;
}

function renderHistory() {
  const tbody = document.getElementById('history-table-body');
  const runs = historyData?.runs || [
    {
      prNumber: 104,
      branch: 'perf/email-digest',
      commitSha: '1a9f0e2',
      changedServices: ['notifications'],
      affectedServices: ['notifications'],
      percentSaved: 80,
      timeSavedMinutes: 10.0
    },
    {
      prNumber: 103,
      branch: 'feature/payment-webhook',
      commitSha: '7e1d5a8',
      changedServices: ['payments'],
      affectedServices: ['notifications', 'payments'],
      percentSaved: 60,
      timeSavedMinutes: 7.5
    },
    {
      prNumber: 102,
      branch: 'fix/token-expiry',
      commitSha: '3c8e4d1',
      changedServices: ['auth'],
      affectedServices: ['auth', 'notifications', 'payments'],
      percentSaved: 40,
      timeSavedMinutes: 5.0
    },
    {
      prNumber: 101,
      branch: 'feature/search-filter',
      commitSha: '9f2a1b4',
      changedServices: ['search'],
      affectedServices: ['search'],
      percentSaved: 80,
      timeSavedMinutes: 10.0
    }
  ];

  tbody.innerHTML = runs.map(r => `
    <tr>
      <td><span class="commit-tag">#${r.prNumber || 'push'}</span></td>
      <td><code>${r.branch || 'main'}</code></td>
      <td><span class="commit-tag">${r.commitSha || 'local'}</span></td>
      <td><code>${(r.changedServices || []).join(', ') || 'none'}</code></td>
      <td><strong style="color:#fbbf24;">${(r.affectedServices || []).length}</strong></td>
      <td><strong style="color:#38bdf8;">${(r.skippedServices || []).length || (5 - (r.affectedServices || []).length)}</strong></td>
      <td><span style="color:#10b981;font-weight:bold;">${r.percentSaved}%</span></td>
      <td><strong>+${r.timeSavedMinutes}m</strong></td>
    </tr>
  `).join('');

  const cumulativeMinutes = historyData?.summary?.cumulativeMinutesSaved ||
    runs.reduce((acc, curr) => acc + (curr.timeSavedMinutes || 0), 0);
  document.getElementById('cumulative-saved-text').textContent = `Total Cumulative Savings: ~${cumulativeMinutes.toFixed(1)} CI minutes saved across ${runs.length} runs`;
}

function initUI() {
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
    renderServiceList();
    const firstSvc = currentBlastRadius.changedServices[0] || currentBlastRadius.affectedServices[0] || 'auth';
    selectService(firstSvc);
  });

  // Select first service by default without auto-scrolling
  const defaultSvc = currentBlastRadius?.changedServices?.[0] || 'auth';
  selectService(defaultSvc);
}

// Global exposure for HTML onclick handlers
window.zoomGraph = zoomGraph;
window.fitGraph = fitGraph;
window.switchLogTab = switchLogTab;
window.selectService = selectService;

window.addEventListener('DOMContentLoaded', loadData);
