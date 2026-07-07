'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dashboardRoot = path.join(root, 'src', 'dashboard', 'js');
const layoutPath = path.join(dashboardRoot, 'ui', 'layout.js');
const registryPath = path.join(dashboardRoot, 'shared', 'moduleRegistry.js');

const extensions = ['.js', '.jsx', '.mjs', '.cjs'];
const entryFiles = new Set([
  normalise(path.join(dashboardRoot, 'main.jsx')),
  normalise(path.join(dashboardRoot, 'App.jsx')),
  normalise(layoutPath),
]);

function normalise(value) {
  return path.normalize(value).replace(/\\/g, '/');
}

function relative(file) {
  return normalise(path.relative(root, file));
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function exists(file) {
  return fs.existsSync(file);
}

function walk(dir, files = []) {
  if (!exists(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else if (extensions.includes(path.extname(entry.name))) files.push(normalise(fullPath));
  }

  return files;
}

function extractRelativeImports(source) {
  const imports = new Set();
  const patterns = [
    /import\s+(?:[^'";]+?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g,
    /import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
    /export\s+(?:[^'";]+?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) imports.add(match[1]);
  }

  return [...imports];
}

function resolveImport(fromFile, request) {
  const base = path.resolve(path.dirname(fromFile), request);
  const candidates = [];

  if (extensions.includes(path.extname(base))) candidates.push(base);
  else {
    for (const extension of extensions) candidates.push(base + extension);
    for (const extension of extensions) candidates.push(path.join(base, `index${extension}`));
  }

  return candidates.map(normalise).find((candidate) => exists(candidate)) || null;
}

function extractRoutes(source) {
  const routes = new Set();
  const pattern = /path:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(source))) routes.add(match[1]);
  return routes;
}

function extractModuleEntries(source) {
  const entries = [];
  const blockPattern = /\{[\s\S]*?key:\s*['"]([^'"]+)['"][\s\S]*?name:\s*['"]([^'"]+)['"][\s\S]*?route:\s*['"]([^'"]+)['"][\s\S]*?\}/g;
  let match;

  while ((match = blockPattern.exec(source))) {
    entries.push({ key: match[1], name: match[2], route: match[3] });
  }

  return entries;
}

function auditFiles() {
  const files = walk(dashboardRoot);
  const fileSet = new Set(files);
  const inbound = new Map(files.map((file) => [file, new Set()]));
  const broken = [];

  for (const file of files) {
    const imports = extractRelativeImports(read(file));

    for (const request of imports) {
      const resolved = resolveImport(file, request);
      if (!resolved) broken.push({ from: file, request });
      else if (fileSet.has(resolved)) inbound.get(resolved)?.add(file);
    }
  }

  const orphanCandidates = files
    .filter((file) => !entryFiles.has(file))
    .filter((file) => (inbound.get(file)?.size || 0) === 0)
    .map(relative)
    .sort();

  console.log('Dashboard file audit');
  console.log('====================');
  console.log(`Scanned files: ${files.length}`);
  console.log(`Broken relative imports: ${broken.length}`);
  console.log(`Orphan candidates: ${orphanCandidates.length}`);

  if (broken.length) {
    console.log('\nBroken imports:');
    for (const item of broken) console.log(`- ${relative(item.from)} -> ${item.request}`);
  }

  if (orphanCandidates.length) {
    console.log('\nOrphan candidates, verify before deleting:');
    for (const file of orphanCandidates) console.log(`- ${file}`);
  }

  return { ok: broken.length === 0, broken, orphanCandidates };
}

function auditRoutes() {
  const missing = [layoutPath, registryPath].filter((file) => !exists(file));
  if (missing.length) {
    console.log('Dashboard route audit');
    console.log('=====================');
    console.log('Missing required files:');
    for (const file of missing) console.log(`- ${relative(file)}`);
    return { ok: false, brokenModuleRoutes: [] };
  }

  const routes = extractRoutes(read(layoutPath));
  const modules = extractModuleEntries(read(registryPath));
  const brokenModuleRoutes = modules.filter((module) => !routes.has(module.route));

  console.log('Dashboard route audit');
  console.log('=====================');
  console.log(`Routes found: ${routes.size}`);
  console.log(`Module registry entries: ${modules.length}`);
  console.log(`Broken module routes: ${brokenModuleRoutes.length}`);

  if (brokenModuleRoutes.length) {
    console.log('\nModule routes missing from dashboard ROUTES:');
    for (const module of brokenModuleRoutes) console.log(`- ${module.name} (${module.key}) -> ${module.route}`);
  }

  return { ok: brokenModuleRoutes.length === 0, brokenModuleRoutes };
}

function run(mode = 'all') {
  const selected = String(mode || 'all').toLowerCase();
  const results = [];

  if (selected === 'files' || selected === 'all') results.push(auditFiles());
  if (selected === 'routes' || selected === 'all') {
    if (results.length) console.log('');
    results.push(auditRoutes());
  }

  if (!results.length) {
    console.error(`Unknown dashboard audit mode: ${mode}`);
    process.exitCode = 1;
    return false;
  }

  const ok = results.every((result) => result.ok);
  if (!ok) process.exitCode = 1;
  return ok;
}

if (require.main === module) run(process.argv[2] || 'all');

module.exports = { run, auditFiles, auditRoutes };
