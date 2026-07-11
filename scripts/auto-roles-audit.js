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
  console.log('\nAuto Roles module audit');
  console.log('=======================');

  checkFile('src/modules/autoRoles/autoRoleStore.js', [
    'defaultAutoRolesSection',
    'normalizeAutoRolesSection',
    'getAutoRolesSection',
    'saveAutoRolesSection',
    'updateAutoRolesSection',
    'setEnabled',
    'setJoinRoles',
    'setBotRoles',
    'updateSettings',
    'incrementAnalytics',
    'resetAutoRolesSection',
  ]);

  checkFile('src/modules/autoRoles/autoRoleManager.js', [
    'isAutoRolesEnabled',
    'applyAutoRoles',
    'configureAutoRoles',
    'setAutoRolesEnabled',
    'addAutoRole',
    'addJoinRole',
    'addBotRole',
    'removeAutoRole',
    'buildHealthReport',
    'repairConfiguration',
    'reapplyToGuild',
    'exportConfiguration',
    'resetAutoRoles',
  ]);

  checkFile('src/modules/autoRoles/autoRoleStartup.js', ['startupAutoRoles']);
  checkFile('src/core/admin/functions/autoRolesAdminPanel.js', ['buildAutoRolesAdminPanel', 'handleAutoRolesAdminInteraction']);
  checkFile('src/server/routes/autoRoles.js');
  checkFile('src/dashboard/js/pages/modules/AutoRoles.jsx');
  checkFile('src/events/client/autoRolesStartup.js');
  checkFile('test/autoRoles.test.js');
  checkFile('docs/modules/auto-roles.md');

  if (errors.length) {
    console.log(`Auto Roles issues: ${errors.length}`);
    for (const error of errors) console.log(` - ${error}`);
    process.exitCode = 1;
    return false;
  }

  console.log('✅ Auto Roles module audit passed.');
  return true;
}

if (require.main === module) audit();

module.exports = { audit };
