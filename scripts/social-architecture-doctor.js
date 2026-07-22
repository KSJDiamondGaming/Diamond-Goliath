'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'src');
const legacyRoot = path.join(sourceRoot, 'modules', 'social');
const canonicalRoot = path.join(sourceRoot, 'modules', 'socialStudio');
const canonicalFiles = Object.freeze([
  'social.js',
  'socialStore.js',
  'socialRuntime.js',
  'socialPanel.js',
  'socialRoute.js',
]);
const retiredFiles = Object.freeze([
  'socialCreatorPanel.js',
  'socialCreatorRoute.js',
  'socialCreators.js',
  'socialDiagnostics.js',
  'socialSimulator.js',
]);

function relative(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function fail(errors, message) {
  errors.push(message);
  console.log(`❌ ${message}`);
}

function pass(message) {
  console.log(`✅ ${message}`);
}

function warn(message) {
  console.log(`⚠️ ${message}`);
}

function listEntries(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .map((entry) => ({ name: entry.name, isFile: entry.isFile(), isDirectory: entry.isDirectory() }))
    .sort((a, b) => a.name.localeCompare(b.name));
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

function auditRetiredImports(errors) {
  const retiredModules = retiredFiles.map((file) => file.replace(/\.js$/, ''));
  const violations = [];
  for (const file of walkJavaScript(sourceRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const moduleName of retiredModules) {
      const importPattern = new RegExp(`(?:require\\s*\\(|from\\s+|import\\s*\\()\\s*['\"][^'\"]*${moduleName}(?:\\.js)?['\"]`);
      if (importPattern.test(source)) violations.push(`${relative(file)} -> ${moduleName}`);
    }
  }
  if (violations.length) {
    for (const violation of violations) fail(errors, `Retired Social helper import: ${violation}`);
  } else {
    pass('No source imports retired Social helpers');
  }
}

function importFile(file, errors) {
  const code = "const file=process.argv[1];try{require(file);process.exit(0)}catch(error){console.error(error?.stack||error?.message||error);process.exit(1)}";
  const result = spawnSync(process.execPath, ['-e', code, file], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
    env: { ...process.env, GOLIATH_IMPORT_AUDIT: 'true' },
  });
  if (result.status === 0) {
    pass(`${relative(file)} imports successfully`);
    return;
  }
  const detail = String(result.stderr || result.stdout || 'unknown import failure').trim().split('\n').slice(0, 4).join(' | ');
  fail(errors, `${relative(file)} failed to import: ${detail}`);
}

function auditMigrationState(errors) {
  if (!fs.existsSync(legacyRoot)) {
    fail(errors, 'Neither the canonical Social Studio directory nor the legacy Social directory exists.');
    return;
  }

  for (const file of retiredFiles) {
    const candidate = path.join(legacyRoot, file);
    if (fs.existsSync(candidate)) fail(errors, `Retired duplicate still exists: ${relative(candidate)}`);
    else pass(`Retired duplicate removed: ${file}`);
  }

  for (const file of canonicalFiles) {
    const candidate = path.join(legacyRoot, file);
    if (fs.existsSync(candidate)) pass(`Migration canonical file present: ${file}`);
    else fail(errors, `Migration canonical file missing: ${relative(candidate)}`);
  }

  warn('Social Studio is still under src/modules/social; exact five-file enforcement activates after the socialStudio rename.');
}

function auditCanonicalState(errors) {
  const entries = listEntries(canonicalRoot);
  const names = entries.map((entry) => entry.name);
  const expected = [...canonicalFiles].sort();
  const unexpected = names.filter((name) => !canonicalFiles.includes(name));
  const missing = canonicalFiles.filter((name) => !names.includes(name));
  const directories = entries.filter((entry) => entry.isDirectory).map((entry) => entry.name);
  const nonFiles = entries.filter((entry) => !entry.isFile).map((entry) => entry.name);

  if (fs.existsSync(legacyRoot)) fail(errors, `Legacy Social directory still exists: ${relative(legacyRoot)}`);
  else pass('Legacy src/modules/social directory is absent');

  if (entries.length !== canonicalFiles.length) fail(errors, `Expected exactly ${canonicalFiles.length} entries in ${relative(canonicalRoot)}; found ${entries.length}.`);
  else pass('Social Studio contains exactly five entries');

  if (missing.length) fail(errors, `Missing canonical files: ${missing.join(', ')}`);
  else pass(`Canonical files present: ${expected.join(', ')}`);

  if (unexpected.length) fail(errors, `Unexpected Social Studio files: ${unexpected.join(', ')}`);
  else pass('No unexpected Social Studio files');

  if (directories.length || nonFiles.length) fail(errors, `Nested directories or non-file entries are not allowed: ${[...new Set([...directories, ...nonFiles])].join(', ')}`);
  else pass('No nested provider/helper directories');

  if (!missing.length && !unexpected.length && entries.length === canonicalFiles.length) {
    for (const file of canonicalFiles) importFile(path.join(canonicalRoot, file), errors);
  }
}

function main() {
  console.log('\nSocial Studio architecture');
  console.log('==========================');
  const errors = [];

  auditRetiredImports(errors);
  if (fs.existsSync(canonicalRoot)) auditCanonicalState(errors);
  else auditMigrationState(errors);

  console.log('');
  if (errors.length) {
    console.error(`Social Studio architecture Doctor failed with ${errors.length} issue(s).`);
    process.exitCode = 1;
    return;
  }
  console.log('Social Studio architecture Doctor passed.');
}

main();