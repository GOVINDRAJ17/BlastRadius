/**
 * BlastRadius Scope Contract Invariant Validator
 * Enforces mathematical consistency across affected, tested, built, and deployed services.
 */

const APPLICATION_SERVICES = ['auth', 'notifications', 'payments', 'search', 'shared'];

function validateScopeContract(report) {
  const errors = [];

  if (!report || typeof report !== 'object') {
    return { valid: false, errors: ['Report payload must be a valid JSON object'] };
  }

  const changed_services = Array.isArray(report.changed_services) ? report.changed_services : [];
  const directly_affected = Array.isArray(report.directly_affected) ? report.directly_affected : [];
  const transitively_affected = Array.isArray(report.transitively_affected) ? report.transitively_affected : [];
  const tested = Array.isArray(report.tested) ? report.tested : [];
  const to_build = Array.isArray(report.to_build) ? report.to_build : [];
  const to_deploy = Array.isArray(report.to_deploy) ? report.to_deploy : [];
  const skipped = Array.isArray(report.skipped) ? report.skipped : [];
  const full_rebuild = Boolean(report.full_rebuild);

  // Invariant 5 & 6: Every reported name must belong to known application services list
  const allReportedNames = new Set([
    ...changed_services,
    ...directly_affected,
    ...transitively_affected,
    ...tested,
    ...to_build,
    ...to_deploy,
    ...skipped
  ]);

  for (const name of allReportedNames) {
    if (!APPLICATION_SERVICES.includes(name)) {
      errors.push(`Unknown service name '${name}': must belong to known application services [${APPLICATION_SERVICES.join(', ')}]`);
    }
  }

  // Invariant 1: tested ⊆ to_build
  for (const svc of tested) {
    if (!to_build.includes(svc)) {
      errors.push(`Invariant violation: 'tested' must be a subset of 'to_build' ('${svc}' in tested but not in to_build)`);
    }
  }

  // Invariant 2: to_deploy ⊆ directly_affected ∪ transitively_affected
  const affectedUnion = new Set([...directly_affected, ...transitively_affected]);
  for (const svc of to_deploy) {
    if (!affectedUnion.has(svc)) {
      errors.push(`Invariant violation: 'to_deploy' must be a subset of directly_affected ∪ transitively_affected ('${svc}' in to_deploy but not affected)`);
    }
  }

  // Invariant 3: to_build == tested for application services
  const sortedTested = [...tested].sort();
  const sortedToBuild = [...to_build].sort();
  if (sortedTested.length !== sortedToBuild.length || !sortedTested.every((v, i) => v === sortedToBuild[i])) {
    errors.push(`Invariant violation: 'to_build' must equal 'tested' for application services (to_build: [${sortedToBuild.join(', ')}], tested: [${sortedTested.join(', ')}])`);
  }

  // Invariant 4: skipped ∩ (tested ∪ to_build ∪ to_deploy) = ∅
  const activeUnion = new Set([...tested, ...to_build, ...to_deploy]);
  for (const svc of skipped) {
    if (activeUnion.has(svc)) {
      errors.push(`Invariant violation: 'skipped' intersects with active set ('${svc}' appears in both skipped and active sets)`);
    }
  }

  // Invariant 7: If full_rebuild == true, then tested == to_deploy == all application services
  if (full_rebuild) {
    const sortedApps = [...APPLICATION_SERVICES].sort();
    const sortedDeploy = [...to_deploy].sort();
    if (sortedTested.length !== sortedApps.length || !sortedTested.every((v, i) => v === sortedApps[i])) {
      errors.push(`Invariant violation: When full_rebuild is true, 'tested' must contain all application services`);
    }
    if (sortedDeploy.length !== sortedApps.length || !sortedDeploy.every((v, i) => v === sortedApps[i])) {
      errors.push(`Invariant violation: When full_rebuild is true, 'to_deploy' must contain all application services`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  APPLICATION_SERVICES,
  validateScopeContract
};

