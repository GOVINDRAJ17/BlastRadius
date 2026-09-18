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
    } else if (args[i] === '--files' && args[i + 1]) {
      // Allows testing or simulation without git diff
      simulatedChangedFiles = args[i + 1].split(',').map(s => s.trim());
      i++;
    }
  }

  return { base, head, simulatedChangedFiles };
}

/**
 * Obtains list of changed files using git diff with multiple fallbacks.
 */
function getChangedFiles(base, head, simulatedFiles) {
  if (simulatedFiles && simulatedFiles.length > 0) {
    return simulatedFiles;
  }

  try {
    // 1. If base and head are specified
    if (base && head) {
      const cmd = `git diff --name-only ${base}...${head}`;
      const output = execSync(cmd, { cwd: ROOT_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      return output.split('\n').map(l => l.trim()).filter(Boolean);
    }

    // 2. If only base is specified (e.g. against main)
    if (base) {
      const cmd = `git diff --name-only ${base}`;
      const output = execSync(cmd, { cwd: ROOT_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      return output.split('\n').map(l => l.trim()).filter(Boolean);
    }

    // 3. Fallback: Check working directory uncommitted/staged changes
    const statusOutput = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf-8' });
    if (statusOutput.trim().length > 0) {
      return statusOutput
        .split('\n')
        .map(l => l.trim().substring(3))
        .filter(Boolean);
    }

    // 4. Fallback: Diff against HEAD~1 if commit exists
    const diffHead1 = execSync('git diff --name-only HEAD~1 HEAD', { cwd: ROOT_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    return diffHead1.split('\n').map(l => l.trim()).filter(Boolean);
  } catch (err) {
    console.warn(`[WARN] Git diff failed (${err.message}). Falling back to git status or empty.`);
    try {
      const st = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf-8' });
      return st.split('\n').map(l => l.trim().substring(3)).filter(Boolean);
    } catch {
      return [];
    }
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
 * Computes blast radius using BFS on the reverse dependency graph.
 */
function computeBlastRadius(graph, changedFiles) {
  const allServices = graph.nodes || Object.keys(graph.dependencies);
  const reverseDeps = graph.reverseDependencies || {};

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

  const changedServices = Array.from(changedServicesSet).sort();
  const affectedServicesSet = new Set();
  const explanations = {};
  const impactPaths = {}; // node -> array of steps explaining propagation

  // Case 1: Special-case "shared" package changed OR root dependencies changed
  // Fallback: full rebuild of all services
  const sharedChanged = changedServices.includes('shared');
  const rootConfigChanged = globalFiles.some(f => f === 'package.json' || f === 'package-lock.json');

  if (sharedChanged || rootConfigChanged) {
    const reason = sharedChanged
      ? 'Shared core utility package was modified (full rebuild fallback)'
      : 'Root package/dependency manifest modified (full rebuild fallback)';

    for (const svc of allServices) {
      affectedServicesSet.add(svc);
      if (changedServices.includes(svc)) {
        explanations[svc] = `Directly modified in git diff (${fileDetailsByService[svc]?.length || 0} file(s))`;
        impactPaths[svc] = [svc];
      } else {
        explanations[svc] = `Included in full rebuild: ${reason}`;
        impactPaths[svc] = [sharedChanged ? 'shared' : 'root', svc];
      }
    }
  } else {
    // Case 2: BFS outward traversal along reverse dependencies
    // Queue contains: { service, pathSoFar }
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
        if (!affectedServicesSet.has(dependent)) {
          affectedServicesSet.add(dependent);
          const newTrace = [...trace, dependent];
          impactPaths[dependent] = newTrace;

          // Build human-friendly explanation
          // e.g. "Tested because it depends on payments, which depends on auth (directly changed)"
          const reversedTrace = [...newTrace].reverse();
          const chainDesc = reversedTrace.join(' -> ');
          explanations[dependent] = `Tested transitively because ${chainDesc} (directly changed)`;

          queue.push({ service: dependent, trace: newTrace });
        }
      }
    }
  }

  const affectedServices = Array.from(affectedServicesSet).sort();
  const skippedServices = allServices.filter(s => !affectedServicesSet.has(s)).sort();

  // Metrics
  const totalServices = allServices.length;
  const affectedCount = affectedServices.length;
  const skippedCount = skippedServices.length;
  const pctSkipped = totalServices > 0 ? Math.round((skippedCount / totalServices) * 100) : 0;
  const estimatedTimeSavedMinutes = skippedCount * ESTIMATED_MINUTES_PER_SERVICE;
  const estimatedTotalTimeMinutes = totalServices * ESTIMATED_MINUTES_PER_SERVICE;
  const estimatedActualTimeMinutes = affectedCount * ESTIMATED_MINUTES_PER_SERVICE;

  return {
    timestamp: new Date().toISOString(),
    totalServices,
    changedServices,
    affectedServices,
    skippedServices,
    changedFiles,
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

  // Ensure dependency graph exists or rebuild it
  let graph;
  if (fs.existsSync(GRAPH_FILE)) {
    graph = JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf-8'));
  } else {
    graph = buildDependencyGraph();
    fs.writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2), 'utf-8');
  }

  const { base, head, simulatedChangedFiles } = parseArgs();
  const changedFiles = getChangedFiles(base, head, simulatedChangedFiles);

  console.log(`📁 Changed Files Detected (${changedFiles.length}):`);
  changedFiles.forEach(f => console.log(`   - ${f}`));

  const result = computeBlastRadius(graph, changedFiles);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n🎯 Blast Radius Output saved to ${path.relative(ROOT_DIR, OUTPUT_FILE)}`);

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
