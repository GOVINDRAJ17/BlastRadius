/**
 * BlastRadius - Dependency Graph Builder
 * Statically analyzes JavaScript/TypeScript imports across monorepo services
 * using Babel AST parsing and builds bidirectional dependency graphs.
 */

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const ROOT_DIR = path.resolve(__dirname);
const SERVICES_DIR = path.join(ROOT_DIR, 'services');
const OUTPUT_FILE = path.join(ROOT_DIR, 'dependency-graph.json');

/**
 * Discovers all service directories under /services/
 */
function discoverServices(servicesDir = SERVICES_DIR) {
  if (!fs.existsSync(servicesDir)) {
    return [];
  }
  return fs.readdirSync(servicesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .sort();
}

/**
 * Recursively retrieves all .js, .ts, .mjs, .cjs files within a directory,
 * ignoring node_modules and hidden folders.
 */
function getSourceFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        results = results.concat(getSourceFiles(fullPath));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx'].includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * Extracts raw import/require statements from code using Babel AST parser.
 */
function extractImportSpecifiers(filePath, code) {
  const imports = [];

  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: 'unambiguous',
      plugins: [
        'typescript',
        'jsx',
        'dynamicImport',
        'topLevelAwait',
        'classProperties',
        'exportDefaultFrom'
      ]
    });
  } catch (err) {
    console.warn(`[WARN] Failed to parse AST for ${filePath}: ${err.message}`);
    return imports;
  }

  traverse(ast, {
    // ES module imports: import x from 'y'
    ImportDeclaration({ node }) {
      if (node.source && node.source.value) {
        imports.push({
          specifier: node.source.value,
          type: 'es-import',
          loc: node.loc ? node.loc.start : null
        });
      }
    },

    // ES module re-exports: export { x } from 'y' or export * from 'y'
    ExportNamedDeclaration({ node }) {
      if (node.source && node.source.value) {
        imports.push({
          specifier: node.source.value,
          type: 'export-from',
          loc: node.loc ? node.loc.start : null
        });
      }
    },
    ExportAllDeclaration({ node }) {
      if (node.source && node.source.value) {
        imports.push({
          specifier: node.source.value,
          type: 'export-all',
          loc: node.loc ? node.loc.start : null
        });
      }
    },

    // CommonJS require('y') or dynamic import('y')
    CallExpression({ node }) {
      // require('...')
      if (
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require' &&
        node.arguments.length > 0 &&
        node.arguments[0].type === 'StringLiteral'
      ) {
        imports.push({
          specifier: node.arguments[0].value,
          type: 'require',
          loc: node.loc ? node.loc.start : null
        });
      }

      // import('...')
      if (
        node.callee.type === 'Import' &&
        node.arguments.length > 0 &&
        node.arguments[0].type === 'StringLiteral'
      ) {
        imports.push({
          specifier: node.arguments[0].value,
          type: 'dynamic-import',
          loc: node.loc ? node.loc.start : null
        });
      }
    }
  });

  return imports;
}

/**
 * Resolves an import specifier from a source file to an internal monorepo service name,
 * or returns null if it's an external module.
 */
function resolveImportToService(currentService, sourceFilePath, specifier, allServices) {
  // Normalize Windows paths
  const normServicesDir = SERVICES_DIR.split(path.sep).join('/');

  // 1. Check direct package name or workspace aliases:
  // e.g. '@monorepo/shared' -> 'shared', or direct service name 'shared'
  const packageMatch = specifier.match(/^@(?:monorepo|blastradius)\/([a-zA-Z0-9_-]+)/);
  if (packageMatch && allServices.includes(packageMatch[1])) {
    return packageMatch[1];
  }
  if (allServices.includes(specifier)) {
    return specifier;
  }

  // 2. Check relative file paths: e.g. '../shared', '../auth/index.js'
  if (specifier.startsWith('.')) {
    const dir = path.dirname(sourceFilePath);
    let resolvedAbsPath = path.resolve(dir, specifier);
    const normResolved = resolvedAbsPath.split(path.sep).join('/');

    // Check if target path is inside SERVICES_DIR
    if (normResolved.startsWith(normServicesDir + '/')) {
      const relToServices = normResolved.substring(normServicesDir.length + 1);
      const targetService = relToServices.split('/')[0];

      if (allServices.includes(targetService)) {
        return targetService;
      }
    }
  }

  // 3. Special-case 'shared' package variations
  if (specifier.includes('shared')) {
    if (allServices.includes('shared')) {
      return 'shared';
    }
  }

  return null;
}

/**
 * Builds full forward and reverse dependency graph for all monorepo services.
 */
function buildDependencyGraph(options = {}) {
  const servicesDir = options.servicesDir || SERVICES_DIR;
  const services = discoverServices(servicesDir);

  const dependencies = {};
  const reverseDependencies = {};
  const edges = [];
  const serviceStats = {};

  // Initialize adjacency lists for all services
  for (const svc of services) {
    dependencies[svc] = [];
    reverseDependencies[svc] = [];
    serviceStats[svc] = {
      filesParsed: 0,
      totalImports: 0,
      internalDependencies: []
    };
  }

  for (const svc of services) {
    const svcDir = path.join(servicesDir, svc);
    const files = getSourceFiles(svcDir);
    serviceStats[svc].filesParsed = files.length;

    const detectedDeps = new Set();

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const imports = extractImportSpecifiers(file, content);
      serviceStats[svc].totalImports += imports.length;

      for (const item of imports) {
        const targetSvc = resolveImportToService(svc, file, item.specifier, services);

        // Self-dependencies are ignored
        if (targetSvc && targetSvc !== svc) {
          detectedDeps.add(targetSvc);

          edges.push({
            from: svc,
            to: targetSvc,
            type: item.type,
            specifier: item.specifier,
            sourceFile: path.relative(ROOT_DIR, file).split(path.sep).join('/')
          });
        }
      }
    }

    dependencies[svc] = Array.from(detectedDeps).sort();
    serviceStats[svc].internalDependencies = dependencies[svc];
  }

  // Construct reverse dependencies: reverseDependencies[svc] = list of services that depend on svc
  for (const [consumer, depList] of Object.entries(dependencies)) {
    for (const provider of depList) {
      if (!reverseDependencies[provider].includes(consumer)) {
        reverseDependencies[provider].push(consumer);
      }
    }
  }

  for (const svc of services) {
    reverseDependencies[svc].sort();
  }

  const graph = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    nodes: services,
    serviceStats,
    dependencies,
    reverseDependencies,
    edges
  };

  return graph;
}

function run() {
  console.log('⚡ BlastRadius: Building Static AST Dependency Graph...');
  const graph = buildDependencyGraph();

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(graph, null, 2), 'utf-8');
  console.log(`✅ Dependency graph written to ${path.relative(ROOT_DIR, OUTPUT_FILE)}`);
  console.log('\n--- Service Forward Dependencies (Who I depend on) ---');
  for (const [svc, deps] of Object.entries(graph.dependencies)) {
    console.log(`  ${svc.padEnd(15)} -> [${deps.join(', ') || 'none'}]`);
  }

  console.log('\n--- Service Reverse Dependencies (Who depends on me / Downstream blast path) ---');
  for (const [svc, dependents] of Object.entries(graph.reverseDependencies)) {
    console.log(`  ${svc.padEnd(15)} <- [${dependents.join(', ') || 'none'}]`);
  }

  return graph;
}

if (require.main === module) {
  run();
}

module.exports = {
  discoverServices,
  getSourceFiles,
  extractImportSpecifiers,
  resolveImportToService,
  buildDependencyGraph
};
