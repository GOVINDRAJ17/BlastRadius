/**
 * BlastRadius - Supabase CI Metrics Sync Engine
 * Posts blast-radius CI reports directly to Supabase ci_runs table.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname);
const BLAST_FILE = path.join(ROOT_DIR, 'blast-radius.json');

// Helper to read .env if present
function loadEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://vjpbunykjtuixiprdaud.supabase.co').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

function getGitCommitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
  } catch {
    return 'local';
  }
}

function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
  } catch {
    return 'master';
  }
}

async function uploadReportToSupabase() {
  if (!fs.existsSync(BLAST_FILE)) {
    console.warn(`[WARN] ${BLAST_FILE} does not exist, skipping Supabase upload.`);
    return null;
  }

  const blastData = JSON.parse(fs.readFileSync(BLAST_FILE, 'utf-8'));
  const runId = process.env.GITHUB_RUN_ID || `run-${Date.now().toString(36)}`;
  const commitSha = (process.env.GITHUB_SHA || getGitCommitSha()).substring(0, 40);
  const branch = process.env.GITHUB_REF_NAME || getGitBranch();

  const payload = {
    github_run_id: String(runId),
    commit_sha: commitSha,
    branch: branch,
    status: 'completed',
    report: blastData
  };

  const postData = JSON.stringify(payload);
  const targetUrl = new URL(`${SUPABASE_URL}/rest/v1/ci_runs`);

  console.log(`📡 Uploading BlastRadius CI report to Supabase (${targetUrl.hostname})...`);
  console.log(`   Branch: ${branch} | Commit: ${commitSha.substring(0, 7)} | Run ID: ${runId}`);

  return new Promise((resolve, reject) => {
    const req = https.request(targetUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ CI report successfully stored in Supabase! (HTTP ${res.statusCode})`);
          try {
            const parsed = JSON.parse(body);
            console.log(`   Stored Row ID: ${parsed[0]?.id || 'created'}`);
            resolve(parsed);
          } catch {
            resolve(body);
          }
        } else {
          console.error(`❌ Failed to store CI report in Supabase (HTTP ${res.statusCode}):`, body);
          reject(new Error(`Supabase returned HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error(`❌ Network error while uploading to Supabase: ${err.message}`);
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

if (require.main === module) {
  uploadReportToSupabase().catch(err => {
    console.error('Supabase sync finished with errors:', err.message);
  });
}

module.exports = {
  uploadReportToSupabase
};
