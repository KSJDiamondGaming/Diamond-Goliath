'use strict';

const fs = require('node:fs');
const path = 'src/owner/dev/duplicatorV2.js';
let s = fs.readFileSync(path, 'utf8');

s = s.replace(
  "  ['ManageWebhooks', PermissionFlagsBits.ManageWebhooks], ['ViewAuditLog', PermissionFlagsBits.ViewAuditLog],\n",
  "  ['ManageWebhooks', PermissionFlagsBits.ManageWebhooks],\n"
);

const runLogAnchor = "function runLog(session, snap) { return { status: session.dryRun ? 'dry-run' : 'running', dryRun: Boolean(session.dryRun), conflictMode: session.conflictMode, rollbackBackupId: null, snapshotStats: snap.stats, copied: { serverSettings: 0, roles: 0, categories: 0, channels: 0, permissionOverwrites: 0, emojis: 0 }, deleted: { roles: 0, channels: 0 }, skipped: [], errors: [], notes: [] }; }\n";

const planner = `function dryRunPlan(guild, snap, conflictMode) {
  const plan = {
    create: { serverSettings: 0, roles: 0, categories: 0, channels: 0, permissionOverwrites: 0, emojis: 0 },
    rename: { roles: 0, categories: 0, channels: 0, emojis: 0 },
    skip: { roles: 0, categories: 0, channels: 0, emojis: 0 },
    delete: { roles: 0, channels: 0 },
  };

  if (snap.settings) {
    const source = snap.settings;
    const current = {
      name: guild.name,
      description: guild.description || null,
      verificationLevel: guild.verificationLevel,
      explicitContentFilter: guild.explicitContentFilter,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      afkTimeout: guild.afkTimeout,
    };
    plan.create.serverSettings = Object.entries(current).reduce((total, [key, value]) => total + (source[key] !== undefined && source[key] !== value ? 1 : 0), 0);
    if (source.iconURL) plan.create.serverSettings += 1;
    if (source.bannerURL) plan.create.serverSettings += 1;
    if (source.splashURL) plan.create.serverSettings += 1;
  }

  for (const role of snap.roles || []) {
    const found = existingRole(guild, role.name);
    if (!found) { plan.create.roles += 1; continue; }
    if (conflictMode === 'skip') plan.skip.roles += 1;
    else if (conflictMode === 'rename') { plan.rename.roles += 1; plan.create.roles += 1; }
    else if (conflictMode === 'replace') { plan.delete.roles += 1; plan.create.roles += 1; }
  }

  for (const channel of snap.channels || []) {
    const found = existingChannel(guild, channel);
    const key = channel.type === ChannelType.GuildCategory ? 'categories' : 'channels';
    if (!found) { plan.create[key] += 1; continue; }
    if (conflictMode === 'skip') plan.skip[key] += 1;
    else if (conflictMode === 'rename') { plan.rename[key] += 1; plan.create[key] += 1; }
    else if (conflictMode === 'replace') { plan.delete.channels += 1; plan.create[key] += 1; }
  }

  plan.create.permissionOverwrites = (snap.channels || []).reduce((total, channel) => total + (channel.permissionOverwrites?.length || 0), 0);

  const emojiNames = new Set(guild.emojis.cache.map((emoji) => String(emoji.name || '').toLowerCase()));
  for (const emoji of snap.emojis || []) {
    const exists = emojiNames.has(String(emoji.name || '').toLowerCase());
    if (!exists) { plan.create.emojis += 1; continue; }
    if (conflictMode === 'skip') plan.skip.emojis += 1;
    else if (conflictMode === 'rename') { plan.rename.emojis += 1; plan.create.emojis += 1; }
    else if (conflictMode === 'replace') plan.create.emojis += 1;
  }

  return plan;
}
function applyDryRunPlan(log, plan) {
  log.copied = { ...log.copied, ...plan.create };
  log.deleted = { ...log.deleted, ...plan.delete };
  const renameTotal = Object.values(plan.rename).reduce((a, b) => a + b, 0);
  const skipTotal = Object.values(plan.skip).reduce((a, b) => a + b, 0);
  if (renameTotal) log.notes.push(\`Would rename: roles \${plan.rename.roles}, categories \${plan.rename.categories}, channels \${plan.rename.channels}, emojis \${plan.rename.emojis}\`);
  if (skipTotal) log.notes.push(\`Would skip existing: roles \${plan.skip.roles}, categories \${plan.skip.categories}, channels \${plan.skip.channels}, emojis \${plan.skip.emojis}\`);
  if (plan.delete.roles || plan.delete.channels) log.notes.push(\`Would replace/delete first: roles \${plan.delete.roles}, channels/categories \${plan.delete.channels}\`);
  log.notes.push('Dry run only — no changes were made.');
}
`;

if (!s.includes('function dryRunPlan(guild, snap, conflictMode)')) {
  if (!s.includes(runLogAnchor)) throw new Error('runLog anchor not found');
  s = s.replace(runLogAnchor, runLogAnchor + planner);
}

const oldDryRun = "  await fetchGuildState(guild); const log = runLog(session, snap); const missing = missingPermissions(guild); if (missing.length) log.errors.push(`Preflight missing permissions: ${missing.join(', ')}`); const hierarchy = hierarchyWarning(guild); if (hierarchy) log.errors.push(`Preflight hierarchy warning: ${hierarchy} Discord does not allow bots to bypass role hierarchy.`); for (const [key, item] of Object.entries(snap.future || {})) if (item?.requested && !item.supported) log.notes.push(`${COPY_OPTIONS[key] || key}: ${item.reason}`); if (session.dryRun) { log.status = 'dry-run'; return log; }\n";
const newDryRun = "  await fetchGuildState(guild); const log = runLog(session, snap); const missing = missingPermissions(guild); if (missing.length) log.errors.push(`Preflight missing permissions: ${missing.join(', ')}`); const hierarchy = hierarchyWarning(guild); if (hierarchy) log.errors.push(`Preflight hierarchy warning: ${hierarchy} Discord does not allow bots to bypass role hierarchy.`); for (const [key, item] of Object.entries(snap.future || {})) if (item?.requested && !item.supported) log.notes.push(`${COPY_OPTIONS[key] || key}: ${item.reason}`); if (session.dryRun) { applyDryRunPlan(log, dryRunPlan(guild, snap, session.conflictMode)); log.status = 'dry-run'; return log; }\n";

if (!s.includes(newDryRun)) {
  if (!s.includes(oldDryRun)) throw new Error('dry-run execution anchor not found');
  s = s.replace(oldDryRun, newDryRun);
}

fs.writeFileSync(path, s);
console.log('Duplicator dry-run patch applied.');
