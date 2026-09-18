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

let graphData = FALLBACK_GRAPH;
let currentBlastRadius = null;
let historyData = null;
let network = null;

async function loadData() {
  try {
    const [graphRes, blastRes, histRes] = await Promise.all([
      fetch('../dependency-graph.json').then(r => r.json()).catch(() => null),
      fetch('../blast-radius.json').then(r => r.json()).catch(() => null),
      fetch('../metrics-history.json').then(r => r.json()).catch(() => null)
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
    console.warn('Could not fetch local JSONs, using fallback simulation state:', err);
    currentBlastRadius = SCENARIOS.auth_only;
    SCENARIOS.current = SCENARIOS.auth_only;
  }

  initUI();
  renderGraph();
  renderStats();
  renderServiceList();
  renderHistory();
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

function renderGraph() {
  const container = document.getElementById('network-container');
  const blast = currentBlastRadius || SCENARIOS.auth_only;

  const nodes = (graphData.nodes || Object.keys(graphData.dependencies)).map(svc => {
    const isSpecial = svc === 'shared';
    const colors = getNodeColor(svc, blast);
    const isAffected = blast.affectedServices.includes(svc);
    const isChanged = blast.changedServices.includes(svc);

    let label = `${svc}\n${isChanged ? '[CHANGED]' : isAffected ? '[TEST]' : '[SKIP]'}`;
    if (isSpecial) label = `★ ${label}`;

    return {
      id: svc,
      label: label,
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
        color: isChanged ? 'rgba(239,68,68,0.5)' : 'rgba(245,158,11,0.5)',
        size: 14,
        x: 0,
        y: 0
      },
      title: buildTooltip(svc, blast)
    };
  });

  const edges = [];
  let edgeId = 1;
  for (const [source, depList] of Object.entries(graphData.dependencies)) {
    for (const target of depList) {
      // Directed edge: source imports from target
      // Highlight if active blast path
      const activePath = blast.affectedServices.includes(source) && blast.affectedServices.includes(target);

      edges.push({
        id: edgeId++,
        from: source,
        to: target,
        arrows: {
          to: { enabled: true, scaleFactor: 0.9 }
        },
        label: 'imports',
        font: { color: '#6b7280', size: 10, align: 'middle' },
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
    physics: {
      solver: 'forceAtlas2Based',
      forceAtlas2Based: {
        gravitationalConstant: -70,
        centralGravity: 0.015,
        springLength: 130,
        springConstant: 0.08,
        damping: 0.85
      },
      stabilization: { iterations: 150 }
    },
    interaction: {
      hover: true,
      tooltipDelay: 100,
      zoomView: true
    }
  };

  if (network) {
    network.destroy();
  }
  network = new vis.Network(container, data, options);

  network.on('click', function (params) {
    if (params.nodes.length > 0) {
      const selectedSvc = params.nodes[0];
      selectService(selectedSvc);
    }
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

  // Highlight in vis-network
  if (network) {
    network.selectNodes([svcName]);
  }
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
    // Default select first affected or changed
    const firstSvc = currentBlastRadius.changedServices[0] || currentBlastRadius.affectedServices[0] || 'auth';
    selectService(firstSvc);
  });

  // Select first service by default
  const defaultSvc = currentBlastRadius?.changedServices?.[0] || 'auth';
  selectService(defaultSvc);
}

window.addEventListener('DOMContentLoaded', loadData);
