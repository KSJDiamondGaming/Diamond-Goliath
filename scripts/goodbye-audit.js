'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_FILES = [
  'src/modules/goodbye/goodbyeStore.js',
  'src/modules/goodbye/goodbyeManager.js',
  'src/modules/goodbye/goodbyeStartup.js',
  'src/core/admin/functions/goodbyeAdminPanel.js',
  'src/server/routes/goodbye.js',
  'src/dashboard/js/pages/modules/Goodbye.jsx',
  'test/goodbye.test.js',
  'docs/modules/goodbye.md',
];

function auditGoodbye() {
  console.log('\nGoodbye module audit');
  console.log('====================');
  const missing = [];
  for (const file of REQUIRED_FILES) {
    const exists = fs.existsSync(path.join(process.cwd(), file));
    console.log(`${exists ? '✅' : '❌'} ${file}`);
    if (!exists) missing.push(file);
  }
  if (missing.length) {
    console.log(`Goodbye module audit failed: ${missing.length} missing file(s).`);
    process.exitCode = 1;
    return false;
  }
  console.log('✅ Goodbye module audit passed.');
  return true;
}

if (require.main === module) auditGoodbye();
module.exports = { auditGoodbye };
