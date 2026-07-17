'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const failures = [];
const checks = [];

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function check(label, condition, detail = '') {
  checks.push({ label, ok: Boolean(condition), detail });
  if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
}
function file(file, exports = []) {
  const full = path.join(root, file);
  check(file, fs.existsSync(full), 'missing');
  if (!fs.existsSync(full) || !exports.length || !file.endsWith('.js')) return;
  try {
    delete require.cache[require.resolve(full)];
    const loaded = require(full);
    check(`${file} exports`, exports.every((name) => loaded?.[name] !== undefined), exports.filter((name) => loaded?.[name] === undefined).join(', '));
  } catch (error) { check(`${file} loads`, false, error.message); }
}

file('src/modules/invites/invites.js', ['getSection', 'trackJoin', 'trackLeave', 'syncGuild', 'leaderboard', 'createManagedInvite', 'validateManagedInvite', 'buildHealth', 'repair', 'startup', 'reset']);
file('src/modules/invites/invitesPanel.js', ['buildInvitesPanel', 'handleInvitesInteraction']);
file('src/modules/invites/invitesRoute.js');
file('src/events/invites/inviteLogs.js');
file('src/commands/admin/invites.js');
file('src/dashboard/js/pages/modules/Invites.jsx');
file('docs/modules/invites.md');

const interactions = read('src/events/interactions/interactionCreate.js');
check('Invite panel registered', interactions.includes("admin:invites") && interactions.includes('handleInvitesInteraction'));
const eventSource = read('src/events/invites/inviteLogs.js');
for (const token of ['ClientReady', 'InviteCreate', 'InviteDelete', 'GuildMemberAdd', 'GuildMemberRemove']) check(`Invite event ${token}`, eventSource.includes(token));
const registry = read('src/dashboard/js/shared/moduleRegistry.js');
check('Dashboard module registered', registry.includes("key: 'invites'") && registry.includes("route: '/invites'"));
const layout = read('src/dashboard/js/ui/layout.js');
check('Dashboard route registered', layout.includes("path: '/invites'") && layout.includes('component: Invites'));
const manifest = require(path.join(root, 'src/core/modules/moduleManifest'));
check('Manifest entry exists', Boolean(manifest.moduleManifest?.invites));
check('Invite Studio is active', manifest.moduleManifest?.invites?.maturity === 'in_progress');
const server = read('server.js');
check('Invite API mounted', server.includes("./src/modules/invites/invitesRoute") && server.includes("app.use('/api/invites'"));

console.log('\nInvite Studio Doctor');
console.log('====================');
for (const item of checks) console.log(`${item.ok ? '✅' : '❌'} ${item.label}${!item.ok && item.detail ? ` — ${item.detail}` : ''}`);
if (failures.length) {
  console.error(`\n❌ Invite Studio Doctor failed with ${failures.length} issue(s).`);
  process.exit(1);
}
console.log('\n✅ Invite Studio acceptance contract passed.');
