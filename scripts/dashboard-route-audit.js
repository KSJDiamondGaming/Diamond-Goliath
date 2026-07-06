'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const layoutPath = path.join(root, 'src', 'dashboard', 'js', 'ui', 'layout.js');
const registryPath = path.join(root, 'src', 'dashboard', 'js', 'shared', 'moduleRegistry.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function extractRoutes(source) {
  const routes = new Set();
  const pattern = /path:\s*['"]([^'"]+)['"]/g;
  let match;

  while ((match = pattern.exec(source))) {
    routes.add(match[1]);
  }

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

function main() {
  const layoutSource = read(layoutPath);
  const registrySource = read(registryPath);
  const routes = extractRoutes(layoutSource);
  const modules = extractModuleEntries(registrySource);
  const brokenModuleRoutes = modules.filter((module) => !routes.has(module.route));

  console.log('Dashboard route audit');
  console.log('=====================');
  console.log(`Routes found: ${routes.size}`);
  console.log(`Module registry entries: ${modules.length}`);
  console.log(`Broken module routes: ${brokenModuleRoutes.length}`);

  if (brokenModuleRoutes.length) {
    console.log('\nModule routes missing from dashboard ROUTES:');
    for (const module of brokenModuleRoutes) {
      console.log(`- ${module.name} (${module.key}) -> ${module.route}`);
    }
    process.exitCode = 1;
  }
}

main();
