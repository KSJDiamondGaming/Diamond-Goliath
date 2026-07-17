'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const failures = [];
const checks = [];

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
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
file('src/modules/invites/invitesRoute.js');
file('src/events/invites/inviteLogs.js');
file('src/core/admin/functions/invitesAdminPanel.js', ['buildInviteStudioPayload', 'handleInviteStudioInteraction']);
file('src/dashboard/js/pages/modules/Invites.jsx');
file('docs/modules/invites.md');

check('Invite slash command removed', !exists('src/commands/admin/invites.js'));
check('Standalone Invite Discord panel removed', !exists('src/modules/invites/invitesPanel.js'));

const runtime = read('src/modules/invites/invites.js');
for (const token of ['inviteLinks', 'roleIds', 'createInviteLink', 'applyInviteRoles', 'temporary', 'maxAge', 'maxUses']) check(`Invite runtime ${token}`, runtime.includes(token));
const route = read('src/modules/invites/invitesRoute.js');
check('Invite link create API', route.includes("router.post('/:guildId/links'"));
check('Invite link delete API', route.includes("router.delete('/:guildId/links/:code'"));

const panel = read('src/core/admin/functions/invitesAdminPanel.js');
for (const token of ['invites:draft-channel', 'invites:draft-expiry', 'invites:draft-uses', 'invites:draft-roles', 'invites:draft-temporary', 'invites:generate']) check(`Invite panel ${token}`, panel.includes(token));
const adminHandler = read('src/core/admin/functions/adminModuleHandler.js');
check('Invite Studio listed in Modules panel', adminHandler.includes("admin:invites") && adminHandler.includes('Invite Studio'));
check('Invite panel handled centrally', adminHandler.includes('handleInviteStudioInteraction') && adminHandler.includes("startsWith('invites:')"));
const moduleRouter = read('src/core/modules/admin/moduleInteractionRouter.js');
check('Invite Studio registered in module router', moduleRouter.includes("'admin:invites': 'invites'"));

const dashboard = read('src/dashboard/js/pages/modules/Invites.jsx');
for (const token of ['Create invite link', 'Roles (optional)', 'Grant temporary membership', '/links']) check(`Invite dashboard ${token}`, dashboard.includes(token));
for (const section of ['Invite Links', 'Analytics', 'Rewards', 'Join History', 'Health', 'Settings']) check(`Invite workspace ${section}`, dashboard.includes(section));
check('Invite links are default workspace tab', dashboard.includes("useState('links')"));
check('Invite link copy action exists', dashboard.includes('navigator.clipboard.writeText'));
check('Invite link table includes channel and temporary status', dashboard.includes('channelName(channels, link.channelId)') && dashboard.includes("link.temporary ? 'Yes' : 'No'"));

const interactions = read('src/events/interactions/interactionCreate.js');
check('No standalone Invite interaction registration', !interactions.includes('invitesPanel'));
const eventSource = read('src/events/invites/inviteLogs.js');
for (const token of ['ClientReady', 'InviteCreate', 'InviteDelete', 'GuildMemberAdd', 'GuildMemberRemove']) check(`Invite event ${token}`, eventSource.includes(token));
const registry = read('src/dashboard/js/shared/moduleRegistry.js');
check('Dashboard module registered', registry.includes("key: 'invites'") && registry.includes("route: '/invites'"));
const layout = read('src/dashboard/js/ui/layout.js');
check('Dashboard route registered', layout.includes("path: '/invites'") && layout.includes('component: Invites'));
const manifest = require(path.join(root, 'src/core/modules/moduleManifest'));
check('Manifest entry exists', Boolean(manifest.moduleManifest?.invites));
check('Invite Studio is active', manifest.moduleManifest?.invites?.maturity === 'in_progress');
check('Invite Studio admin panel capability', manifest.moduleManifest?.invites?.capabilities?.adminPanel === true);
check('Invite Studio dashboard capability', manifest.moduleManifest?.invites?.capabilities?.dashboard === true);
const server = read('server.js');
check('Invite API imported', server.includes('./src/modules/invites/invitesRoute'));
check('Invite API mounted', server.includes("['/api/invites', invitesRoutes]") || server.includes("app.use('/api/invites'"));

console.log('\nInvite Studio Doctor');
console.log('====================');
for (const item of checks) console.log(`${item.ok ? '✅' : '❌'} ${item.label}${!item.ok && item.detail ? ` — ${item.detail}` : ''}`);
if (failures.length) {
  console.error(`\n❌ Invite Studio Doctor failed with ${failures.length} issue(s).`);
  process.exit(1);
}
console.log('\n✅ Invite Studio acceptance contract passed.');
