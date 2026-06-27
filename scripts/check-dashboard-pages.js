'use strict';

const path = require('path');

const { assert, printHeader, read, resolveRoot } = require('./lib/scriptUtils');

const LAYOUT_FILE = resolveRoot('src', 'dashboard', 'js', 'ui', 'layout.js');
const MODULE_REGISTRY_FILE = resolveRoot('src', 'dashboard', 'js', 'shared', 'moduleRegistry.js');

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
}

function importPathToFile(importPath) {
  const base = path.resolve(path.dirname(LAYOUT_FILE), importPath);
  const candidates = [
    `${base}.jsx`,
    `${base}.js`,
    path.join(base, 'index.jsx'),
    path.join(base, 'index.js'),
  ];

  return candidates.find((candidate) => require('fs').existsSync(candidate)) || null;
}

function extractLazyImports(source) {
  const regex = /lazy\(\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)\)/g;
  return [...source.matchAll(regex)].map((match) => match[1]);
}

function extractRouteBlock(source) {
  const match = source.match(/export\s+const\s+ROUTES\s*=\s*\[([\s\S]*?)\];/);
  assert(match, 'ROUTES export not found in layout.js');
  return match[1];
}

function extractRouteKeys(source) {
  return [...extractRouteBlock(source).matchAll(/key:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function extractRoutePaths(source) {
  return [...extractRouteBlock(source).matchAll(/path:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function extractPageLayoutKeys(source) {
  const match = source.match(/export\s+const\s+PAGE_LAYOUTS\s*=\s*\{([\s\S]*?)\n\};/);
  assert(match, 'PAGE_LAYOUTS export not found in layout.js');
  return [...match[1].matchAll(/\n\s*([a-zA-Z0-9_]+):\s*\{/g)].map((entry) => entry[1]);
}

function extractReferencedSections(source) {
  return [...new Set([...source.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]))];
}

function extractSectionKeys(source) {
  const match = source.match(/export\s+const\s+SECTION_DEFS\s*=\s*\{([\s\S]*?)\n\};/);
  assert(match, 'SECTION_DEFS export not found in layout.js');
  return [...match[1].matchAll(/\n\s*([a-zA-Z0-9_]+):\s*\{/g)].map((entry) => entry[1]);
}

function extractModuleRoutes(source) {
  return [...source.matchAll(/route:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function main() {
  const source = stripComments(read(LAYOUT_FILE));
  const moduleRegistrySource = stripComments(read(MODULE_REGISTRY_FILE));

  const lazyImports = extractLazyImports(source);
  assert(lazyImports.length > 0, 'No lazy page imports found in layout.js');

  const missingImports = lazyImports
    .map((importPath) => ({ importPath, filePath: importPathToFile(importPath) }))
    .filter((entry) => !entry.filePath);

  assert(
    missingImports.length === 0,
    `Missing lazy page imports:\n${missingImports.map((entry) => `- ${entry.importPath}`).join('\n')}`
  );

  const routeKeys = extractRouteKeys(source);
  const routePaths = new Set(extractRoutePaths(source));
  const layoutKeys = new Set(extractPageLayoutKeys(source));
  const missingLayouts = routeKeys.filter((key) => !layoutKeys.has(key));

  assert(
    missingLayouts.length === 0,
    `Missing PAGE_LAYOUTS entries for routes:\n${missingLayouts.map((key) => `- ${key}`).join('\n')}`
  );

  const referencedSections = extractReferencedSections(source);
  const sectionKeys = new Set(extractSectionKeys(source));
  const missingSections = referencedSections.filter((id) => !sectionKeys.has(id));

  assert(
    missingSections.length === 0,
    `Missing SECTION_DEFS entries:\n${missingSections.map((id) => `- ${id}`).join('\n')}`
  );

  const moduleRoutes = extractModuleRoutes(moduleRegistrySource);
  const missingModuleRoutes = moduleRoutes.filter((route) => !routePaths.has(route));

  assert(
    missingModuleRoutes.length === 0,
    `Module registry routes missing from ROUTES:\n${missingModuleRoutes.map((route) => `- ${route}`).join('\n')}`
  );

  printHeader('✅ Dashboard pages OK', {
    'Lazy pages': lazyImports.length,
    Routes: routeKeys.length,
    'Module launchers': moduleRoutes.length,
  });
}

main();
