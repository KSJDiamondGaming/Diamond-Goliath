'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

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

function audit() {
  console.log('\nRuntime import audit');
  console.log('====================');

  const files = collectTargets();
  const errors = [];
  let loaded = 0;

  for (const filePath of files) {
    try {
      delete require.cache[require.resolve(filePath)];
      require(filePath);
      console.log(`✅ ${rel(filePath)}`);
      loaded += 1;
    } catch (error) {
      console.log(`❌ ${rel(filePath)}`);
      errors.push(`${rel(filePath)}: ${error.message}`);
    }
  }

  console.log(`\nRuntime files scanned: ${files.length}`);
  console.log(`Runtime files loadable: ${loaded}`);

  if (errors.length) {
    console.log(`Runtime import issues: ${errors.length}`);
    for (const error of errors) console.log(` - ${error}`);
    process.exitCode = 1;
    return false;
  }

  console.log('✅ Runtime import audit passed.');
  return true;
}

if (require.main === module) audit();

module.exports = { audit };
