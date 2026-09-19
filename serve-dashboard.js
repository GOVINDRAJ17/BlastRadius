/**
 * BlastRadius - Dedicated Dashboard Server
 * Serves static assets, JSON models, and visualizer files seamlessly on port 3001.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const ROOT_DIR = path.resolve(__dirname);
const DASHBOARD_DIR = path.join(ROOT_DIR, 'dashboard');

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

function resolveFilePath(urlPath) {
  // Normalize and strip query strings or hashes
  const cleanPath = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);

  // Root or dashboard entry point
  if (cleanPath === '/' || cleanPath === '/dashboard' || cleanPath === '/dashboard/') {
    return path.join(DASHBOARD_DIR, 'index.html');
  }

  // 1. Direct match relative to monorepo root
  const fromRoot = path.join(ROOT_DIR, cleanPath);
  if (fs.existsSync(fromRoot) && fs.statSync(fromRoot).isFile()) {
    return fromRoot;
  }

  // 2. Direct match relative to dashboard/ directory
  const fromDashboard = path.join(DASHBOARD_DIR, cleanPath.replace(/^\/dashboard\//, '/'));
  if (fs.existsSync(fromDashboard) && fs.statSync(fromDashboard).isFile()) {
    return fromDashboard;
  }

  // 3. Flat filename fallback within dashboard/ (e.g. /style.css -> dashboard/style.css)
  const basename = path.basename(cleanPath);
  const fromDashboardBasename = path.join(DASHBOARD_DIR, basename);
  if (fs.existsSync(fromDashboardBasename) && fs.statSync(fromDashboardBasename).isFile()) {
    return fromDashboardBasename;
  }

  return null;
}

const server = http.createServer((req, res) => {
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

  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 BlastRadius Dashboard running at:`);
  console.log(`   👉 http://localhost:${PORT}/`);
  console.log(`   👉 http://localhost:${PORT}/dashboard/index.html\n`);
});
