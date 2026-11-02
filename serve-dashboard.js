/**
 * BlastRadius - Dedicated Dashboard Server
 * Serves static assets, JSON models, and visualizer files seamlessly on port 3001.
 * Features live file watching on services/ with automatic real-time recomputation.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { buildDependencyGraph } = require('./build-graph.js');
const { computeBlastRadius, getChangedFiles } = require('./compute-blast-radius.js');

const PORT = 3001;
const ROOT_DIR = path.resolve(__dirname);
const DASHBOARD_DIR = path.join(ROOT_DIR, 'dashboard');
const SERVICES_DIR = path.join(ROOT_DIR, 'services');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const sseClients = new Set();

function notifyClients(payload) {
  const data = JSON.stringify(payload);
  for (const client of sseClients) {
    try {
      client.write(`event: update\ndata: ${data}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

function recomputeAll() {
  try {
    const graph = buildDependencyGraph();
    const graphJson = JSON.stringify(graph, null, 2);
    fs.writeFileSync(path.join(ROOT_DIR, 'dependency-graph.json'), graphJson, 'utf-8');
    if (fs.existsSync(DASHBOARD_DIR)) {
      fs.writeFileSync(path.join(DASHBOARD_DIR, 'dependency-graph.json'), graphJson, 'utf-8');
    }

    const changedFiles = getChangedFiles(null, null, null);
    const blast = computeBlastRadius(graph, changedFiles);
    const blastJson = JSON.stringify(blast, null, 2);
    fs.writeFileSync(path.join(ROOT_DIR, 'blast-radius.json'), blastJson, 'utf-8');
    if (fs.existsSync(DASHBOARD_DIR)) {
      fs.writeFileSync(path.join(DASHBOARD_DIR, 'blast-radius.json'), blastJson, 'utf-8');
    }

    console.log(`[BlastRadius Engine] Recomputed successfully: ${blast.changedServices.length} changed, ${blast.affectedServices.length} affected.`);
    notifyClients({ timestamp: Date.now(), blast, graph });
    return { success: true, blast, graph };
  } catch (err) {
    console.error('[BlastRadius Engine] Recompute error:', err.message);
    return { success: false, error: err.message };
  }
}

// Watch services directory for live instant updates on code changes
if (fs.existsSync(SERVICES_DIR)) {
  let debounceTimeout = null;
  try {
    fs.watch(SERVICES_DIR, { recursive: true }, (eventType, filename) => {
      if (!filename || filename.includes('node_modules') || filename.startsWith('.')) return;
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        console.log(`\n🔄 Service code modified (${filename}) — re-analyzing AST and updating blast radius...`);
        recomputeAll();
      }, 300);
    });
    console.log('👀 Watching services/ for live code changes...');
  } catch (watchErr) {
    console.warn('File watching not available in this environment:', watchErr.message);
  }
}

function resolveFilePath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);

  if (cleanPath === '/' || cleanPath === '/dashboard' || cleanPath === '/dashboard/') {
    return path.join(DASHBOARD_DIR, 'index.html');
  }

  // 1. Direct match relative to dashboard/ directory
  const fromDashboard = path.join(DASHBOARD_DIR, cleanPath.replace(/^\/dashboard\//, '/'));
  if (fs.existsSync(fromDashboard) && fs.statSync(fromDashboard).isFile()) {
    return fromDashboard;
  }

  // 2. Direct match relative to monorepo root
  const fromRoot = path.join(ROOT_DIR, cleanPath);
  if (fs.existsSync(fromRoot) && fs.statSync(fromRoot).isFile()) {
    return fromRoot;
  }

  // 3. Flat filename fallback within dashboard/ (e.g. /style.css -> dashboard/style.css)
  const basename = path.basename(cleanPath);
  const fromDashboardBasename = path.join(DASHBOARD_DIR, basename);
  if (fs.existsSync(fromDashboardBasename) && fs.statSync(fromDashboardBasename).isFile()) {
    return fromDashboardBasename;
  }

  return null;
}

function handleRequest(req, res) {
  const cleanUrl = req.url.split('?')[0];

  // API: Fetch Supabase CI runs
  if (cleanUrl === '/api/ci-runs') {
    try {
      const handler = require('./api/ci-runs.js');
      // Mock setHeader for Node http.ServerResponse if needed
      return handler(req, res);
    } catch (apiErr) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: apiErr.message }));
      return;
    }
  }

  // API: Force refresh & recompute
  if (cleanUrl === '/api/refresh') {
    const result = recomputeAll();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(result));
    return;
  }

  // API: Live Server-Sent Events stream for instant UI sync
  if (cleanUrl === '/api/live') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 3000\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  const filePath = resolveFilePath(req.url);

  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`404 Not Found: ${req.url}`);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });

  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    res.end('Internal Server Error');
  });
  stream.pipe(res);
}

process.on('uncaughtException', (err) => {
  console.error('Server uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Server unhandled rejection:', reason);
});

// Run initial recomputation on launch
recomputeAll();

const requestedPort = process.env.PORT ? parseInt(process.env.PORT, 10) : null;
const portsToTry = requestedPort ? [requestedPort] : [3000, 3001];

console.log(`\n🚀 Starting BlastRadius Dashboard Server...`);
for (const port of portsToTry) {
  const server = http.createServer(handleRequest);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️  Port ${port} is already in use.`);
    } else {
      console.error(`Error on port ${port}:`, err.message);
    }
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`   👉 http://localhost:${port}/`);
    console.log(`   👉 http://localhost:${port}/dashboard/index.html`);
  });
}
