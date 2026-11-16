/**
 * Serverless / API Route: /api/ci-runs
 * Fetches real-time CI run reports from Supabase ci_runs table.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://vjpbunykjtuixiprdaud.supabase.co').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

function getLocalRuns() {
  const candidatePaths = [
    path.join(__dirname, '..', 'metrics-history.json'),
    path.join(__dirname, '..', 'dashboard', 'metrics-history.json'),
    path.join(process.cwd(), 'metrics-history.json'),
    path.join(process.cwd(), 'dashboard', 'metrics-history.json')
  ];

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (raw && Array.isArray(raw.runs)) {
          return { source: 'local-file', runs: raw.runs, summary: raw.summary || {} };
        }
      }
    } catch {}
  }

  // Also try direct require as static bundle fallback
  try {
    const bundleData = require('../dashboard/metrics-history.json');
    if (bundleData && Array.isArray(bundleData.runs)) {
      return { source: 'local-file', runs: bundleData.runs, summary: bundleData.summary || {} };
    }
  } catch {}

  return { source: 'empty', runs: [], summary: {} };
}

module.exports = async function handler(req, res) {
  // Set CORS and Cache-Control headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // If Supabase key is not configured, gracefully serve local metrics history
  if (!SUPABASE_KEY) {
    const local = getLocalRuns();
    res.statusCode = 200;
    res.end(JSON.stringify(local));
    return;
  }

  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/ci_runs?select=*&order=created_at.desc&limit=30`);

    const data = await new Promise((resolve, reject) => {
      const request = https.get(url, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`Supabase returned ${response.statusCode}`));
          }
        });
      });

      request.on('error', reject);
    });

    // Map Supabase rows to dashboard runs model
    const runs = data.map(row => {
      const rep = row.report || {};
      const metrics = rep.metrics || {};
      return {
        runId: row.github_run_id,
        prNumber: null,
        commitSha: row.commit_sha ? row.commit_sha.substring(0, 7) : 'ci',
        author: 'ci',
        branch: row.branch,
        timestamp: row.created_at,
        changedServices: rep.changedServices || [],
        affectedServices: rep.affectedServices || [],
        skippedServices: rep.skippedServices || [],
        totalServices: rep.totalServices || 5,
        percentSaved: metrics.percentSaved ?? (rep.skippedServices?.length ? (rep.skippedServices.length / 5) * 100 : 0),
        timeSavedMinutes: metrics.estimatedTimeSavedMinutes ?? 0,
        actualTimeMinutes: metrics.estimatedActualTimeMinutes ?? 0
      };
    });

    res.statusCode = 200;
    res.end(JSON.stringify({
      source: 'supabase',
      runs: runs,
      count: runs.length
    }));
  } catch (err) {
    // Fallback to local metrics-history.json if Supabase is unreachable
    const local = getLocalRuns();
    if (local.runs && local.runs.length > 0) {
      res.statusCode = 200;
      res.end(JSON.stringify(local));
      return;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ source: 'fallback-empty', runs: [], error: err.message }));
  }
};
