'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const errors = [];

function checkFile(file, exports = []) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) {
    errors.push(`${file}: missing file`);
    console.log(`❌ ${file}`);
    return;
  }

  if (!exports.length || !file.endsWith('.js')) {
    console.log(`✅ ${file}`);
    return;
  }

  try {
    delete require.cache[require.resolve(absolute)];
    const loaded = require(absolute);
    const missing = exports.filter((name) => loaded?.[name] === undefined);
    if (missing.length) {
      errors.push(`${file}: missing export(s) ${missing.join(', ')}`);
      console.log(`❌ ${file}`);
      return;
    }
    console.log(`✅ ${file}`);
  } catch (error) {
    errors.push(`${file}: failed to load - ${error.message}`);
    console.log(`❌ ${file}`);
  }
}

function audit() {
  console.log('\nWelcome module audit');
  console.log('====================');

  checkFile('src/modules/welcome/welcomeStore.js', [
    'defaultWelcomeSection',
    'normalizeWelcomeSection',
    'getWelcomeSection',
    'updateConfig',
    'incrementAnalytics',
    'resetWelcomeSection',
  ]);
  checkFile('src/modules/welcome/welcomeManager.js', [
    'buildTemplateVariables',
    'buildDiscordPayload',
    'sendWelcome',
    'buildHealthReport',
    'repairConfiguration',
    'exportConfiguration',
    'resetWelcome',
  ]);
  checkFile('src/modules/welcome/welcomeStartup.js', ['startupWelcome']);
  checkFile('src/core/admin/functions/welcomeAdminPanel.js', ['buildWelcomeAdminPanel', 'handleWelcomeAdminInteraction']);
  checkFile('src/server/routes/welcome.js');
  checkFile('src/dashboard/js/pages/modules/Welcome.jsx');
  checkFile('src/events/client/welcomeStartup.js');
  checkFile('docs/modules/welcome.md');

  if (errors.length) {
    console.log(`Welcome issues: ${errors.length}`);
    for (const error of errors) console.log(` - ${error}`);
    process.exitCode = 1;
    return false;
  }

  console.log('✅ Welcome module audit passed.');
  return true;
}

if (require.main === module) process.exit(audit() ? 0 : 1);

module.exports = { audit };
