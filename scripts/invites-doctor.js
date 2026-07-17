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
function file(filePath, exports = []) {
  const full = path.join(root, filePath);
  check(filePath, fs.existsSync(full), 'missing');
  if (!fs.existsSync(full) || !exports.length || !filePath.endsWith('.js')) return;
  try {
    delete require.cache[require.resolve(full)];
    const loaded = require(full);
    check(`${filePath} exports`, exports.every((name) => loaded?.[name] !== undefined), exports.filter((name) => loaded?.[name] === undefined).join(', '));
  } catch (error) { check(`${filePath} loads`, false, error.message); }
}

file('src/modules/invites/invites.js', ['getSection', 'trackJoin', 'trackLeave', 'syncGuild', 'leaderboard', 'createInviteLink', 'deleteInviteLink', 'listInviteLinks', 'applyInviteRoles', 'createManagedInvite', 'validateManagedInvite', 'buildHealth', 'repair', 'startup', 'reset']);
file('src/modules/invites/invitesPanel.js', ['buildPanel', 'handleInteraction']);
file('src/modules/invites/invitesRoute.js');
file('src/events/invites/inviteLogs.js');
file('src/commands/admin/invites.js');
file('src/dashboard/js/pages/modules/Invites.jsx');
file('docs/modules/invites.md');

const runtime = read('src/modules/invites/invites.js');
for (const token of ['inviteLinks', 'roleIds', 'createInviteLink', 'applyInviteRoles', 'temporary', 'maxAge', 'maxUses']) check(`Invite runtime ${token}`, runtime.includes(token));
const panel = read('src/modules/invites/invitesPanel.js');
for (const token of ['draft-channel', 'draft-expiry', 'draft-uses', 'draft-roles', 'draft-temporary', 'generate-link']) check(`Invite panel ${token}`, panel.includes(token));
const route = read('src/modules/invites/invitesRoute.js');
check('Invite link create API', route.includes("router.post('/:guildId/links'"));
check('Invite link delete API', route.includes("router.delete('/:guildId/links/:code'"));
const dashboard = read('src/dashboard/js/pages/modules/Invites.jsx');
for (const token of ['Create invite link', 'Roles (optional)', 'Grant temporary membership', '/links']) check(`Invite dashboard ${token}`, dashboard.includes(token));

const interactions = read('src/events/interactions/interactionCreate.js');
check('Invite panel registered', interactions.includes('admin:invites') && interactions.includes('handleInteraction'));
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
check('Invite API imported', server.includes("./src/modules/invites/invitesRoute"));
check('Invite API mounted', server.includes("['/api/invites', invitesRoutes]") || server.includes("app.use('/api/invites'"));

console.log('\nInvite Studio Doctor');
console.log('====================');
for (const item of checks) console.log(`${item.ok ? '✅' : '❌'} ${item.label}${!item.ok && item.detail ? ` — ${item.detail}` : ''}`);
if (failures.length) {
  console.error(`\n❌ Invite Studio Doctor failed with ${failures.length} issue(s).`);
  process.exit(1);
}
console.log('\n✅ Invite Studio acceptance contract passed.');
