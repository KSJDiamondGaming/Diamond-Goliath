'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assertContains(file, needle, label) {
  const source = read(file);
  if (!source.includes(needle)) {
    throw new Error(`${label} missing in ${file}: ${needle}`);
  }
}

function main() {
  assertContains(
    'src/dashboard/js/services/apiClient.js',
    'getGuildModules: (guildId) => request(`/api/modules/${guildId}`)',
    'Frontend modules loader contract'
  );

  assertContains(
    'src/dashboard/js/services/apiClient.js',
    'setGuildModuleEnabled: (guildId, moduleKey, enabled) => request(`/api/modules/${guildId}/${moduleKey}/enabled`',
    'Frontend modules toggle contract'
  );

  assertContains(
    'src/server/routes/modules.js',
    "router.get('/:guildId'",
    'Backend modules root route'
  );

  assertContains(
    'src/server/routes/modules.js',
    "router.patch('/:guildId/:moduleKey/enabled'",
    'Backend modules toggle route'
  );

  console.log('✅ Dashboard API contracts OK');
}

main();
