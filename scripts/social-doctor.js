'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const checks = [
  ['src/modules/social/social.js', ['startup', 'diagnostics', 'creators', 'simulator', 'queue', 'history']],
  ['src/modules/social/socialPanel.js', ['buildSocialAdminPanel', 'handleSocialAdminInteraction']],
  ['src/modules/social/socialCreatorPanel.js', ['buildCreatorHubPanel', 'handleSocialCreatorInteraction']],
  ['src/modules/social/socialRoute.js', []],
  ['src/modules/social/socialCreatorRoute.js', []],
  ['src/modules/social/socialHealth.js', ['buildHealth', 'repair', 'exportConfig', 'reset']],
  ['src/modules/social/socialDiagnostics.js', ['buildDiagnostics', 'providerDiagnostics', 'creatorDiagnostics']],
  ['src/modules/social/socialCreators.js', ['list', 'save', 'linkAccount', 'unlinkAccount', 'rebuild']],
  ['src/modules/social/socialSimulator.js', ['build', 'simulate']],
  ['src/modules/social/socialScheduler.js', ['runSocialCheck', 'startSocialScheduler']],
  ['src/modules/social/socialQueue.js', ['list', 'processGuild', 'start']],
  ['src/modules/social/socialHistory.js', ['list', 'record', 'summary']],
  ['src/commands/admin/socialhub.js', ['data', 'execute']],
  ['src/dashboard/js/pages/modules/Social.jsx', []],
  ['docs/modules/social-alerts.md', []],
];

const errors = [];
console.log('\nSocial Studio doctor');
console.log('====================');

for (const [relativePath, exports] of checks) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    errors.push(`${relativePath}: missing file`);
    console.log(`❌ ${relativePath}`);
    continue;
  }

  if (!relativePath.endsWith('.js') || !exports.length) {
    console.log(`✅ ${relativePath}`);
    continue;
  }

  try {
    delete require.cache[require.resolve(fullPath)];
    const loaded = require(fullPath);
    const missing = exports.filter((name) => loaded?.[name] === undefined);
    if (missing.length) {
      errors.push(`${relativePath}: missing export(s) ${missing.join(', ')}`);
      console.log(`❌ ${relativePath}`);
    } else {
      console.log(`✅ ${relativePath}`);
    }
  } catch (error) {
    errors.push(`${relativePath}: failed to load - ${error.message}`);
    console.log(`❌ ${relativePath}`);
  }
}

const socialRoute = fs.readFileSync(path.join(root, 'src/modules/social/socialRoute.js'), 'utf8');
for (const required of ['socialCreatorRoute', "router.use('/:guildId/creator-hub'"]) {
  if (!socialRoute.includes(required)) errors.push(`src/modules/social/socialRoute.js: missing ${required}`);
}

const interactionRouter = fs.readFileSync(path.join(root, 'src/events/interactions/interactionCreate.js'), 'utf8');
for (const required of ['socialPanel', 'socialCreatorPanel']) {
  if (!interactionRouter.includes(required)) errors.push(`interactionCreate.js: missing ${required} registration`);
}

if (errors.length) {
  console.error(`\nSocial Studio doctor failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):`);
  for (const error of errors) console.error(` - ${error}`);
  process.exitCode = 1;
} else {
  console.log('\n✅ Social Studio doctor passed.');
}
