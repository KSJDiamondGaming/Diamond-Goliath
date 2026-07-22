'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'src');
const socialRoot = path.join(sourceRoot, 'modules', 'social');

const REQUIRED_FILES = Object.freeze([
  'providerRegistry.js',
  'social.js',
  'socialDelivery.js',
  'socialHealth.js',
  'socialHistory.js',
  'socialManager.js',
  'socialPanel.js',
  'socialQueue.js',
  'socialRoute.js',
  'socialRuntime.js',
  'socialScheduler.js',
  'socialStore.js',
]);

const RETIRED_FILES = Object.freeze([
  'socialCreatorPanel.js',
  'socialCreatorRoute.js',
  'socialCreators.js',
  'socialDiagnostics.js',
  'socialSimulator.js',
]);

const REQUIRED_RUNTIME_EXPORTS = Object.freeze([
  'startup',
  'diagnostics',
  'delivery',
  'creators',
  'simulator',
  'queue',
  'history',
  'providers',
  'scheduler',
]);

function relative(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function walkJavaScript(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkJavaScript(fullPath));
    else if (entry.isFile() && /\.(?:cjs|js|mjs)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function addError(errors, message) {
  errors.push(message);
  console.log(`❌ ${message}`);
}

function pass(message) {
  console.log(`✅ ${message}`);
}

function auditFiles(errors) {
  if (!fs.existsSync(socialRoot)) {
    addError(errors, `Canonical Social Studio directory is missing: ${relative(socialRoot)}`);
    return;
  }

  for (const file of REQUIRED_FILES) {
    const candidate = path.join(socialRoot, file);
    if (fs.existsSync(candidate)) pass(`Canonical file present: ${file}`);
    else addError(errors, `Canonical file missing: ${relative(candidate)}`);
  }

  for (const file of RETIRED_FILES) {
    const candidate = path.join(socialRoot, file);
    if (fs.existsSync(candidate)) addError(errors, `Absorbed helper still exists: ${relative(candidate)}`);
    else pass(`Absorbed helper removed: ${file}`);
  }
}

function auditRetiredImports(errors) {
  const retiredModules = RETIRED_FILES.map((file) => file.replace(/\.js$/, ''));
  const violations = [];
  for (const file of walkJavaScript(sourceRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const moduleName of retiredModules) {
      const pattern = new RegExp(`(?:require\\s*\\(|from\\s+|import\\s*\\()\\s*['\"][^'\"]*${moduleName}(?:\\.js)?['\"]`);
      if (pattern.test(source)) violations.push(`${relative(file)} -> ${moduleName}`);
    }
  }
  if (violations.length) for (const violation of violations) addError(errors, `Retired Social helper import: ${violation}`);
  else pass('No source imports absorbed Social helpers');
}

function auditRuntimeContract(errors) {
  const entry = path.join(socialRoot, 'social.js');
  const code = [
    "const entry=process.argv[1];",
    "const required=JSON.parse(process.argv[2]);",
    "try {",
    "  const social=require(entry);",
    "  const missing=required.filter((name)=>social?.[name]===undefined);",
    "  if (missing.length) throw new Error(`missing export(s): ${missing.join(', ')}`);",
    "} catch (error) { console.error(error?.stack||error?.message||error); process.exit(1); }",
  ].join('');
  const result = spawnSync(process.execPath, ['-e', code, entry, JSON.stringify(REQUIRED_RUNTIME_EXPORTS)], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
    env: { ...process.env, GOLIATH_IMPORT_AUDIT: 'true' },
  });
  if (result.status === 0) pass('Canonical Social Studio runtime imports and exports successfully');
  else addError(errors, `Canonical Social Studio runtime contract failed: ${String(result.stderr || result.stdout || 'unknown failure').trim().split('\n').slice(0, 5).join(' | ')}`);
}

function auditAbsorbedCapabilities(errors) {
  const runtimePath = path.join(socialRoot, 'socialRuntime.js');
  if (!fs.existsSync(runtimePath)) return;
  const source = fs.readFileSync(runtimePath, 'utf8');
  for (const marker of ['socialCreators', 'socialSimulator', 'socialDiagnostics', 'buildDiagnostics', 'simulateSocialAlert']) {
    if (source.includes(marker)) pass(`Absorbed runtime capability present: ${marker}`);
    else addError(errors, `socialRuntime.js is missing absorbed capability marker: ${marker}`);
  }
}

function main() {
  console.log('\nSocial Studio architecture');
  console.log('==========================');
  const errors = [];

  auditFiles(errors);
  auditRetiredImports(errors);
  auditAbsorbedCapabilities(errors);
  auditRuntimeContract(errors);

  console.log('');
  if (errors.length) {
    console.error(`Social Studio architecture Doctor failed with ${errors.length} issue(s).`);
    process.exitCode = 1;
    return;
  }
  console.log('Social Studio architecture Doctor passed.');
}

main();
