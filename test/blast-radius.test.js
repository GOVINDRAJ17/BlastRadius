const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { computeBlastRadius, ROOT_REBUILD_CONFIGS } = require('../compute-blast-radius.js');

const graph = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dependency-graph.json'), 'utf-8'));

test('5.a: docker-compose.yml change triggers full_rebuild: true and records reason', () => {
  const result = computeBlastRadius(graph, ['docker-compose.yml']);
  assert.equal(result.full_rebuild, true);
  assert.ok(result.full_rebuild_reason.includes('docker-compose.yml'), `Expected reason to name file, got: ${result.full_rebuild_reason}`);
  assert.deepEqual(result.to_deploy, ['auth', 'notifications', 'payments', 'search', 'shared']);
  assert.deepEqual(result.skipped, []);
});

test('5.a: .gitattributes change is not a runtime config and yields full_rebuild: false', () => {
  const result = computeBlastRadius(graph, ['.gitattributes']);
  assert.equal(result.full_rebuild, false);
  assert.equal(result.full_rebuild_reason, null);
  assert.deepEqual(result.to_deploy, []);
});
