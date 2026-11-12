/**
 * BlastRadius - Blast Radius Computation Engine
 * Computes direct and transitive impact of git diff changes using
 * reverse dependency graph traversal.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { buildDependencyGraph } = require('./build-graph.js');

const ROOT_DIR = path.resolve(__dirname);
const GRAPH_FILE = path.join(ROOT_DIR, 'dependency-graph.json');
const OUTPUT_FILE = path.join(ROOT_DIR, 'blast-radius.json');
const SCOPE_FILE = path.join(ROOT_DIR, 'deployment-scope.json');
const ESTIMATED_MINUTES_PER_SERVICE = 2.5; // Baseline build/test minutes per service in full CI

/**
 * Parses command-line arguments and environment variables for base and head refs.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let base = process.env.BASE_REF || process.env.GITHUB_BASE_REF || null;
  let head = process.env.HEAD_REF || process.env.GITHUB_SHA || null;
  let simulatedChangedFiles = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base' && args[i + 1]) {
      base = args[i + 1];
      i++;
    } else if (args[i] === '--head' && args[i + 1]) {
      head = args[i + 1];
      i++;
    } else if (args[i] === '--files') {
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        simulatedChangedFiles = args[i + 1].split(',').map(s => s.trim()).filter(Boolean);
        i++;
      } else {
        simulatedChangedFiles = [];
      }
    } else if (args[i].startsWith('--files=')) {
      simulatedChangedFiles = args[i].substring('--files='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (!args[i].startsWith('--')) {
      if (!simulatedChangedFiles) simulatedChangedFiles = [];
      simulatedChangedFiles.push(...args[i].split(',').map(s => s.trim()).filter(Boolean));
    }
  }

  return { base, head, simulatedChangedFiles };
}

const IGNORED_DIFF_PATTERNS = new Set([
  'dependency-graph.json',
  'blast-radius.json',
  'deployment-scope.json',
  'metrics-history.json',
  'dashboard/dependency-graph.json',
  'dashboard/blast-radius.json',
  'dashboard/deployment-scope.json',
  'dashboard/metrics-history.json',
  'package-lock.json',
  '.gitignore'
]);

function filterMeaningfulFiles(files) {
  return files
    .map(f => f.trim().replace(/^"(.*)"$/, '$1').split('\\').join('/'))
    .filter(f => {
      if (!f) return false;
      const base = path.basename(f);
      if (IGNORED_DIFF_PATTERNS.has(f) || IGNORED_DIFF_PATTERNS.has(base)) return false;
      return true;
    });
}

/**
 * Obtains list of changed files using git diff with multiple fallbacks.
 */
function getChangedFiles(base, head, simulatedFiles) {
  if (simulatedFiles !== null && Array.isArray(simulatedFiles)) {
    const files = filterMeaningfulFiles(simulatedFiles);
    files.missingBase = false;
    files.missingBaseReason = null;
    files.baseRef = base || null;
    return files;
  }

  // If explicit base was requested, verify its existence first to catch missing-base cases (new branch/force push)
  if (base) {
    let baseValid = false;
    try {
      execSync(`git rev-parse --verify ${base}`, { cwd: ROOT_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      baseValid = true;
    } catch {
      baseValid = false;
    }

    if (!baseValid) {
      console.warn(`[WARN] Requested base ref '${base}' could not be resolved (new branch or force push). Falling back to full rebuild.`);
      const files = [];
      files.missingBase = true;
      files.missingBaseReason = `Missing or invalid git diff base ref '${base}' (new branch or force push)`;
      files.baseRef = base;
      return files;
    }
  }

  try {
    // 1. If base and head are specified
    if (base && head) {
      const cmd = `git diff --name-only ${base}...${head}`;
      const output = execSync(cmd, { cwd: ROOT_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      const files = filterMeaningfulFiles(output.split('\n'));
      files.missingBase = false;
      files.missingBaseReason = null;
      files.baseRef = base;
      if (files.length > 0) return files;
    }

    // 2. If only base is specified (e.g. against main)
    if (base) {
      const cmd = `git diff --name-only ${base}`;
      const output = execSync(cmd, { cwd: ROOT_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      const files = filterMeaningfulFiles(output.split('\n'));
      files.missingBase = false;
      files.missingBaseReason = null;
      files.baseRef = base;
      if (files.length > 0) return files;
    }

    // 3. Fallback: Check working directory uncommitted/staged changes
    const statusOutput = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf-8' });
    if (statusOutput.trim().length > 0) {
      const uncommitted = statusOutput
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 2)
        .map(l => {
          const raw = l.substring(2).trim();
          return raw.includes('->') ? raw.split('->')[1].trim() : raw;
        });
      const files = filterMeaningfulFiles(uncommitted);
      files.missingBase = false;
      files.missingBaseReason = null;
      files.baseRef = 'HEAD';
      if (files.length > 0) return files;
    }

    // 4. Fallback: Diff against HEAD~1 if commit exists
    try {
      const diffHead1 = execSync('git diff --name-only HEAD~1 HEAD', { cwd: ROOT_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      const files = filterMeaningfulFiles(diffHead1.split('\n'));
      files.missingBase = false;
      files.missingBaseReason = null;
      files.baseRef = 'HEAD~1';
      if (files.length > 0) return files;
    } catch {}

    // 5. Fallback: Diff against origin/master, master, origin/main, main
    const targetBranches = ['origin/master', 'master', 'origin/main', 'main'];
    for (const b of targetBranches) {
      try {
        const diffBranch = execSync(`git diff --name-only ${b}...HEAD`, { cwd: ROOT_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        const files = filterMeaningfulFiles(diffBranch.split('\n'));
        files.missingBase = false;
        files.missingBaseReason = null;
        files.baseRef = b;
        if (files.length > 0) return files;
      } catch {}
    }

    const empty = [];
    empty.missingBase = false;
    empty.missingBaseReason = null;
    empty.baseRef = base || null;
    return empty;
  } catch (err) {
    console.warn(`[WARN] Git diff resolution warning: ${err.message}`);
    const empty = [];
    empty.missingBase = !!base;
    empty.missingBaseReason = base ? `Missing or invalid git diff base ref '${base}' (new branch or force push)` : null;
    empty.baseRef = base || null;
    return empty;
  }
}

/**
 * Maps a file path to its owning service name, or null if outside services/
 */
function mapFileToService(filePath, knownServices) {
  const normalized = filePath.split('\\').join('/');
  const match = normalized.match(/^services\/([a-zA-Z0-9_-]+)\//);
  if (match && knownServices.includes(match[1])) {
    return match[1];
  }
  return null;
}

/**
 * Computes blast radius using BFS on the reverse dependency graph and produces
 * the canonical Phase 1 deployment-scope contract.
 */
function computeBlastRadius(graph, changedFiles, options = {}) {
  const applicationServices = (graph.applicationServices || (graph.nodes || []).filter(s => s !== 'api')).slice().sort();
  const infrastructureServices = (graph.infrastructureServices || ['api']).slice().sort();
  const allServices = (graph.nodes || Object.keys(graph.dependencies)).slice().sort();
  const reverseDeps = graph.reverseDependencies || {};

  const missingBase = options.missingBase || (changedFiles && changedFiles.missingBase) || false;
  const missingBaseReason = options.missingBaseReason || (changedFiles && changedFiles.missingBaseReason) || null;
  const baseRef = options.baseRef || (changedFiles && changedFiles.baseRef) || options.base || null;

  const changedServicesSet = new Set();
  const fileDetailsByService = {};
  const globalFiles = [];

  for (const file of changedFiles) {
    const svc = mapFileToService(file, allServices);
    if (svc) {
      changedServicesSet.add(svc);
      if (!fileDetailsByService[svc]) fileDetailsByService[svc] = [];
      fileDetailsByService[svc].push(file);
    } else {
      globalFiles.push(file);
    }
  }

  const allChangedServices = Array.from(changedServicesSet).sort();
  const changedAppServices = allChangedServices.filter(s => applicationServices.includes(s));
  const changedInfraServices = allChangedServices.filter(s => infrastructureServices.includes(s));
  const changedServices = changedAppServices;

  const affectedServicesSet = new Set();
  const explanations = {};
  const impactPaths = {}; // node -> array of steps explaining propagation

  let full_rebuild = false;
  let full_rebuild_reason = null;

  // Case 0: Missing or invalid base ref (new branch or force push fallback)
  if (missingBase) {
    full_rebuild = true;
    full_rebuild_reason = missingBaseReason || 'Missing or invalid git diff base ref (new branch or force push)';
    for (const svc of applicationServices) {
      affectedServicesSet.add(svc);
      explanations[svc] = `Included in full rebuild: ${full_rebuild_reason}`;
      impactPaths[svc] = ['root', svc];
    }
  }
  // Case 1: Shared core package modified OR root config/lockfile changed
  else if (changedServices.includes('shared') || globalFiles.some(f => f === 'package.json' || f === 'package-lock.json')) {
    full_rebuild = true;
    const isShared = changedServices.includes('shared');
    full_rebuild_reason = isShared
      ? 'Shared core utility package was modified (full rebuild fallback)'
      : 'Root package/dependency manifest modified (full rebuild fallback)';

    for (const svc of applicationServices) {
      affectedServicesSet.add(svc);
      if (changedServices.includes(svc)) {
        explanations[svc] = `Directly modified in git diff (${fileDetailsByService[svc]?.length || 0} file(s))`;
        impactPaths[svc] = [svc];
      } else {
        explanations[svc] = `Included in full rebuild: ${full_rebuild_reason}`;
        impactPaths[svc] = [isShared ? 'shared' : 'root', svc];
      }
    }
  }
  // Case 2: Standard BFS outward along reverse dependencies
  else if (changedServices.length > 0) {
    const queue = [];

    for (const svc of changedServices) {
      affectedServicesSet.add(svc);
      explanations[svc] = `Directly modified in git diff (${fileDetailsByService[svc]?.length || 0} file(s))`;
      impactPaths[svc] = [svc];
      queue.push({ service: svc, trace: [svc] });
    }

    while (queue.length > 0) {
      const { service: currentSvc, trace } = queue.shift();
      const downstreamDependents = reverseDeps[currentSvc] || [];

      for (const dependent of downstreamDependents) {
        if (!applicationServices.includes(dependent)) continue;

        if (!affectedServicesSet.has(dependent)) {
          affectedServicesSet.add(dependent);
          const newTrace = [...trace, dependent];
          impactPaths[dependent] = newTrace;

          const reversedTrace = [...newTrace].reverse();
          const chainDesc = reversedTrace.join(' -> ');
          explanations[dependent] = `Tested transitively because ${chainDesc} (directly changed)`;

          queue.push({ service: dependent, trace: newTrace });
        }
      }
    }
  }
  // Case 3: Empty change set (no files changed, nothing affected)

  const affectedServices = Array.from(affectedServicesSet).sort();
  const skippedServices = applicationServices.filter(s => !affectedServicesSet.has(s)).sort();

  // Directly affected vs transitively affected calculation
  let directly_affected = [];
  if (missingBase) {
    directly_affected = [...applicationServices];
  } else if (full_rebuild && changedServices.includes('shared')) {
    directly_affected = ['shared'];
  } else if (full_rebuild) {
    directly_affected = [];
  } else {
    directly_affected = [...changedServices];
  }
  directly_affected.sort();

  const transitively_affected = affectedServices.filter(s => !directly_affected.includes(s)).sort();

  // Derivation of tested, to_build, and to_deploy from the single source of truth (affectedServices)
  const tested = [...affectedServices];
  const to_build = [...affectedServices];
  const to_deploy = [...affectedServices];

  // Metrics (computed strictly over application services)
  const totalServices = applicationServices.length;
  const affectedCount = affectedServices.length;
  const skippedCount = skippedServices.length;
  const pctSkipped = totalServices > 0 ? Math.round((skippedCount / totalServices) * 100) : 0;
  const estimatedTimeSavedMinutes = skippedCount * ESTIMATED_MINUTES_PER_SERVICE;
  const estimatedTotalTimeMinutes = totalServices * ESTIMATED_MINUTES_PER_SERVICE;
  const estimatedActualTimeMinutes = affectedCount * ESTIMATED_MINUTES_PER_SERVICE;

  let commit_sha = process.env.GITHUB_SHA || '';
  if (!commit_sha) {
    try {
      commit_sha = execSync('git rev-parse HEAD', { cwd: ROOT_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    } catch {
      commit_sha = 'local';
    }
  }

  let commitSha = commit_sha.substring(0, 7);
  let branch = process.env.GITHUB_REF_NAME || 'master';
  let commitMessage = 'manual update';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    commitMessage = execSync('git log -1 --pretty=%B', { cwd: ROOT_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim().split('\n')[0];
  } catch {}

  const deploymentScope = {
    commit_sha,
    base_ref: baseRef,
    changed_files: changedFiles.slice().map(f => f.split('\\').join('/')),
    changed_services: changedServices,
    changed_infrastructure: changedInfraServices,
    directly_affected,
    transitively_affected,
    tested,
    to_build,
    to_deploy,
    skipped: skippedServices,
    full_rebuild,
    full_rebuild_reason,
    causal_paths: impactPaths
  };

  return {
    ...deploymentScope,
    // CamelCase aliases and legacy metrics for dashboard backward compatibility
    timestamp: new Date().toISOString(),
    commitSha,
    branch,
    commitMessage,
    totalServices,
    changedServices,
    affectedServices,
    skippedServices,
    changedFiles: changedFiles.slice().map(f => f.split('\\').join('/')),
    fileDetailsByService,
    globalFiles,
    explanations,
    impactPaths,
    metrics: {
      affectedCount,
      skippedCount,
      percentSaved: pctSkipped,
      estimatedTimeSavedMinutes,
      estimatedActualTimeMinutes,
      estimatedTotalTimeMinutes
    }
  };
}

function run() {
  console.log('💥 BlastRadius: Calculating Impact Radius...');

  // Always refresh dependency graph to capture latest imports across services
  const graph = buildDependencyGraph();
  fs.writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2), 'utf-8');

  const dashboardDir = path.join(ROOT_DIR, 'dashboard');
  if (fs.existsSync(dashboardDir)) {
    fs.writeFileSync(path.join(dashboardDir, 'dependency-graph.json'), JSON.stringify(graph, null, 2), 'utf-8');
  }

  const { base, head, simulatedChangedFiles } = parseArgs();
  const changedFiles = getChangedFiles(base, head, simulatedChangedFiles);

  console.log(`📁 Changed Files Detected (${changedFiles.length}):`);
  changedFiles.forEach(f => console.log(`   - ${f}`));

  const result = computeBlastRadius(graph, changedFiles, {
    base,
    missingBase: changedFiles.missingBase,
    missingBaseReason: changedFiles.missingBaseReason,
    baseRef: changedFiles.baseRef || base
  });

  const deploymentScope = {
    commit_sha: result.commit_sha,
    base_ref: result.base_ref,
    changed_files: result.changed_files,
    changed_services: result.changed_services,
    directly_affected: result.directly_affected,
    transitively_affected: result.transitively_affected,
    tested: result.tested,
    to_build: result.to_build,
    to_deploy: result.to_deploy,
    skipped: result.skipped,
    full_rebuild: result.full_rebuild,
    full_rebuild_reason: result.full_rebuild_reason,
    causal_paths: result.causal_paths
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n🎯 Blast Radius Output saved to ${path.relative(ROOT_DIR, OUTPUT_FILE)}`);

  fs.writeFileSync(SCOPE_FILE, JSON.stringify(deploymentScope, null, 2), 'utf-8');
  console.log(`📋 Deployment Scope Contract saved to ${path.relative(ROOT_DIR, SCOPE_FILE)}`);

  if (fs.existsSync(dashboardDir)) {
    const dashboardOutputFile = path.join(dashboardDir, 'blast-radius.json');
    fs.writeFileSync(dashboardOutputFile, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`🎯 Blast Radius Output copied to ${path.relative(ROOT_DIR, dashboardOutputFile)}`);

    const dashboardScopeFile = path.join(dashboardDir, 'deployment-scope.json');
    fs.writeFileSync(dashboardScopeFile, JSON.stringify(deploymentScope, null, 2), 'utf-8');
    console.log(`📋 Deployment Scope Contract copied to ${path.relative(ROOT_DIR, dashboardScopeFile)}`);
  }

  console.log('\n================ Blast Radius Summary ================');
  console.log(`  Total Services in Monorepo: ${result.totalServices}`);
  console.log(`  Directly Changed:          ${result.changedServices.join(', ') || 'None'}`);
  console.log(`  Affected (Must Test):      ${result.affectedServices.join(', ') || 'None'}`);
  console.log(`  Skipped (Safe to Skip):    ${result.skippedServices.join(', ') || 'None'}`);
  console.log(`  CI Time Saved:             ~${result.metrics.percentSaved}% (~${result.metrics.estimatedTimeSavedMinutes} minutes saved)`);
  console.log('======================================================');

  if (result.affectedServices.length > 0) {
    console.log('\nCausal Explanations:');
    for (const svc of result.affectedServices) {
      console.log(`  * [${svc}]: ${result.explanations[svc]}`);
    }
  }

  return result;
}

if (require.main === module) {
  run();
}

module.exports = {
  parseArgs,
  getChangedFiles,
  mapFileToService,
  computeBlastRadius
};
