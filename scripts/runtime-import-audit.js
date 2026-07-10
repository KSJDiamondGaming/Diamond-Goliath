'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const IMPORT_TIMEOUT_MS = Number(process.env.GOLIATH_IMPORT_AUDIT_TIMEOUT_MS || 15000);
const SLOW_IMPORT_MS = Number(process.env.GOLIATH_IMPORT_AUDIT_SLOW_MS || 3000);

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function getAllJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...getAllJsFiles(fullPath));
    else if (
      entry.isFile() &&
      entry.name.endsWith('.js') &&
      !entry.name.endsWith('.test.js') &&
      !entry.name.endsWith('.spec.js')
    ) files.push(fullPath);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function collectTargets() {
  const directories = [
    path.join(root, 'src', 'events'),
    path.join(root, 'src', 'core', 'admin', 'functions'),
    path.join(root, 'src', 'server', 'routes'),
  ];

  const explicitFiles = [
    path.join(root, 'src', 'modules', 'autoRoles', 'autoRoleStartup.js'),
    path.join(root, 'src', 'modules', 'tickets', 'ticketStartup.js'),
    path.join(root, 'src', 'modules', 'translation', 'translationStartup.js'),
    path.join(root, 'src', 'modules', 'verification', 'verificationStartup.js'),
    path.join(root, 'src', 'modules', 'roles', 'rolesStartup.js'),
    path.join(root, 'src', 'modules', 'giveaways', 'giveawayScheduler.js'),
  ];

  return [...new Set([
    ...directories.flatMap(getAllJsFiles),
    ...explicitFiles.filter(fs.existsSync),
  ])].sort((a, b) => a.localeCompare(b));
}

function auditFile(filePath) {
  const auditCode = `
    const file = process.argv[1];
    try {
      require(file);
      process.exit(0);
    } catch (error) {
      console.error(error && (error.stack || error.message) || error);
      process.exit(1);
    }
  `;

  const startedAt = Date.now();
  const result = spawnSync(process.execPath, ['-e', auditCode, filePath], {
    cwd: root,
    encoding: 'utf8',
    timeout: IMPORT_TIMEOUT_MS,
    windowsHide: true,
    env: {
      ...process.env,
      GOLIATH_IMPORT_AUDIT: 'true',
    },
  });
  const durationMs = Date.now() - startedAt;

  if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM') {
    return {
      ok: false,
      durationMs,
      error: `import did not complete within ${IMPORT_TIMEOUT_MS}ms`,
    };
  }

  if (result.status !== 0) {
    const output = String(result.stderr || result.stdout || 'Unknown import failure').trim();
    return {
      ok: false,
      durationMs,
      error: output.split('\n').slice(0, 8).join('\n'),
    };
  }

  return {
    ok: true,
    durationMs,
    slow: durationMs >= SLOW_IMPORT_MS,
  };
}

function audit() {
  console.log('\nRuntime import audit');
  console.log('====================');

  const files = collectTargets();
  const errors = [];
  const slowImports = [];
  let loaded = 0;

  for (const filePath of files) {
    const relativePath = rel(filePath);
    process.stdout.write(`Checking ${relativePath}... `);

    const result = auditFile(filePath);
    if (result.ok) {
      console.log(result.slow ? `⚠️ ${result.durationMs}ms` : `✅ ${result.durationMs}ms`);
      loaded += 1;
      if (result.slow) slowImports.push(`${relativePath}: ${result.durationMs}ms`);
      continue;
    }

    console.log('❌');
    errors.push(`${relativePath}: ${result.error}`);
  }

  console.log(`\nRuntime files scanned: ${files.length}`);
  console.log(`Runtime files loadable: ${loaded}`);

  if (slowImports.length) {
    console.log(`Slow runtime imports: ${slowImports.length}`);
    for (const item of slowImports) console.log(` - ${item}`);
  }

  if (errors.length) {
    console.log(`Runtime import issues: ${errors.length}`);
    for (const error of errors) console.log(` - ${error}`);
    process.exitCode = 1;
    return false;
  }

  console.log('✅ Runtime import audit passed.');
  return true;
}

if (require.main === module) {
  const ok = audit();
  process.exit(ok ? 0 : 1);
}

module.exports = { audit, auditFile };
