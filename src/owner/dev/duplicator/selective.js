'use strict';

const http = require('node:http');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
} = require('discord.js');
const history = require('./history');

const PREFIX = 'dupselect';
const SESSION_TTL = 30 * 60 * 1000;
const PAGE_SIZE = 20;
const BRIDGE_PORTS = Object.freeze({ DEV: 3002, BETA: 3012, PRODUCTION: 3022 });
const sessions = new Map();
let core = null;

function configure(value) { core = value; }
function mode() { return String(process.env.BOT_MODE || 'DEV').trim().toUpperCase(); }
function bridgePort(environment) { return Number(process.env[`DUPLICATOR_BRIDGE_PORT_${environment}`] || BRIDGE_PORTS[environment]); }
function bridgeSecret() { return String(process.env.DUPLICATOR_BRIDGE_SECRET || '').trim(); }
function componentId(session, action) { return `${PREFIX}:${session.id}:${action}`; }
function parseId(customId) {
  const [prefix, sessionId, ...rest] = String(customId || '').split(':');
  return prefix === PREFIX && sessionId && rest.length ? { sessionId, action: rest.join(':') } : null;
}
function prune() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) if (!session || session.expiresAt <= now) sessions.delete(id);
}
function sessionFor(interaction, id) {
  prune();
  const session = sessions.get(id);
  if (!session || session.ownerId !== interaction.user?.id) return null;
  session.expiresAt = Date.now() + SESSION_TTL;
  return session;
}
function makeSession(interaction) {
  const session = {
    id: `${interaction.user.id}-${Date.now().toString(36)}`,
    ownerId: interaction.user.id,
    controlGuildId: interaction.guild.id,
    sourceGuildId: null,
    destinationGuildId: interaction.guild.id,
    directory: [],
    snapshot: null,
    selected: new Set(),
    page: 0,
    deletePage: 0,
    deleteSelected: new Set(),
    deleteItems: [],
    lastManifestId: null,
    expiresAt: Date.now() + SESSION_TTL,
  };
  sessions.set(session.id, session);
  return session;
}
function embed(title, description, color = 0x5865f2) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();
}
function guildEntry(session, id) { return session.directory.find((item) => item.id === String(id || '')) || null; }
function guildLabel(session, id) {
  const item = guildEntry(session, id);
  return item ? `${item.name} · ${(item.environments || [item.environment]).join('/')}` : (id || 'Not selected');
}
function guildOptions(session, selectedId) {
  return session.directory.slice(0, 25).map((guild) => ({
    label: String(guild.name || guild.id).slice(0, 100),
    description: `${(guild.environments || [guild.environment]).join('/')} • ${guild.id}`.slice(0, 100),
    value: guild.id,
    default: guild.id === selectedId,
  }));
}
function destinationEnvironment(interaction, session, guildId) {
  if (interaction.client.guilds.cache.has(guildId)) return mode();
  const entry = guildEntry(session, guildId);
  const envs = entry?.environments || [entry?.environment].filter(Boolean);
  return envs[0] || entry?.environment || mode();
}
function bridgeRequest(environment, method, path, payload = null, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const body = payload == null ? null : Buffer.from(JSON.stringify(payload));
    const headers = { accept: 'application/json' };
    if (body) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(body.length);
    }
    if (bridgeSecret()) headers['x-goliath-duplicator-secret'] = bridgeSecret();
    const req = http.request({ host: '127.0.0.1', port: bridgePort(environment), method, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        let data = {};
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch {}
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(data.error || `Bridge ${environment} returned ${res.statusCode}`));
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Bridge ${environment} timed out`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
async function snapshotFor(interaction, session, guildId) {
  const local = interaction.client.guilds.cache.get(guildId);
  if (local) {
    await local.roles.fetch().catch(() => null);
    await local.channels.fetch().catch(() => null);
    await local.members.fetchMe().catch(() => null);
    return core.snapshot(local, ['roles', 'categories', 'channels', 'permissions']);
  }
  const env = destinationEnvironment(interaction, session, guildId);
  const response = await bridgeRequest(env, 'POST', '/snapshot', {
    guildId,
    selectedOptions: ['roles', 'categories', 'channels', 'permissions'],
  });
  return response.snapshot;
}
function orderedSnapshotItems(snapshot) {
  const all = snapshot?.channels || [];
  const categories = all.filter((c) => c.type === ChannelType.GuildCategory).sort((a, b) => a.position - b.position);
  const childrenByParent = new Map();
  const roots = [];
  for (const channel of all.filter((c) => c.type !== ChannelType.GuildCategory).sort((a, b) => a.position - b.position)) {
    if (channel.parentId) {
      if (!childrenByParent.has(channel.parentId)) childrenByParent.set(channel.parentId, []);
      childrenByParent.get(channel.parentId).push(channel);
    } else roots.push(channel);
  }
  const output = [];
  for (const category of categories) {
    output.push({ ...category, itemKind: 'category' });
    for (const child of childrenByParent.get(category.id) || []) output.push({ ...child, itemKind: 'channel' });
  }
  for (const root of roots) output.push({ ...root, itemKind: 'channel' });
  return output;
}
function typeEmoji(channel) {
  if (channel.type === ChannelType.GuildCategory) return '📁';
  if ([ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) return '🔊';
  return '#';
}
function pageSlice(items, page) {
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(pageCount - 1, page));
  return { safePage, pageCount, items: items.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE) };
}
function categoryChildren(snapshot, categoryId) {
  return (snapshot?.channels || []).filter((channel) => channel.parentId === categoryId).map((channel) => channel.id);
}
function normalizeSelection(snapshot, selected) {
  const required = new Set(selected);
  for (const id of [...required]) {
    const channel = (snapshot?.channels || []).find((item) => item.id === id);
    if (channel?.parentId) required.add(channel.parentId);
  }
  return required;
}
function dependencyRoleIds(snapshot, selected) {
  const requiredChannels = normalizeSelection(snapshot, selected);
  const ids = new Set();
  for (const channel of snapshot?.channels || []) {
    if (!requiredChannels.has(channel.id)) continue;
    for (const overwrite of channel.permissionOverwrites || []) {
      if (Number(overwrite.type) !== 0 || overwrite.id === snapshot.sourceGuild?.id) continue;
      ids.add(overwrite.id);
    }
  }
  return ids;
}
function filteredSnapshot(snapshot, selected) {
  const requiredChannels = normalizeSelection(snapshot, selected);
  const roleIds = dependencyRoleIds(snapshot, selected);
  const channels = (snapshot.channels || []).filter((channel) => requiredChannels.has(channel.id));
  const roles = (snapshot.roles || []).filter((role) => roleIds.has(role.id));
  const managedRoles = (snapshot.managedRoles || []).filter((role) => roleIds.has(role.id));
  const permissionOverwrites = channels.reduce((sum, channel) => sum + (channel.permissionOverwrites || []).length, 0);
  return {
    ...snapshot,
    options: ['roles', 'categories', 'channels', 'permissions'],
    settings: null,
    roles,
    managedRoles,
    channels,
    emojis: [],
    future: {},
    stats: {
      roles: roles.length,
      managedRoles: managedRoles.length,
      roleDependencies: roles.length + managedRoles.length,
      categories: channels.filter((c) => c.type === ChannelType.GuildCategory).length,
      channels: channels.filter((c) => c.type !== ChannelType.GuildCategory).length,
      permissionOverwrites,
      emojis: 0,
    },
  };
}
function emptyScanPayload(session) {
  return {
    embeds: [embed('🧭 Select Source Structure', 'No selectable categories or channels were found in the source server.')],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(componentId(session, 'back')).setLabel('Back').setStyle(ButtonStyle.Secondary))],
  };
}
function landingPayload(session) {
  const ready = Boolean(session.sourceGuildId && session.destinationGuildId && session.sourceGuildId !== session.destinationGuildId);
  return {
    embeds: [embed('📋 Server Duplicator — Selective Copy', [
      `**Source:** ${guildLabel(session, session.sourceGuildId)}`,
      `**Destination:** ${guildLabel(session, session.destinationGuildId)}`,
      '',
      'Scan the source, select only the categories/channels you want, and Goliath will carry the roles required by their permissions.',
      '',
      '**DEV only.** Role base permissions and category/channel overwrites are dependencies of the selected structure.',
    ].join('\n'))],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(session, 'source')).setPlaceholder('Source server').addOptions(guildOptions(session, session.sourceGuildId))),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(session, 'destination')).setPlaceholder('Destination server').addOptions(guildOptions(session, session.destinationGuildId))),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(componentId(session, 'scan')).setLabel('Scan Source').setEmoji('🔎').setStyle(ButtonStyle.Primary).setDisabled(!ready),
        new ButtonBuilder().setCustomId(componentId(session, 'history')).setLabel('Transfer History').setEmoji('📜').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(componentId(session, 'delete-scan')).setLabel('Bulk Delete').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(!session.destinationGuildId),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  };
}
function scanPayload(session) {
  const items = orderedSnapshotItems(session.snapshot);
  if (!items.length) return emptyScanPayload(session);
  const page = pageSlice(items, session.page);
  session.page = page.safePage;
  const options = page.items.map((item) => ({
    label: `${item.itemKind === 'category' ? 'CATEGORY • ' : ''}${item.name}`.slice(0, 100),
    description: `${typeEmoji(item)} ${item.itemKind === 'category' ? 'Selects category + children' : `ID ${item.id}`}`.slice(0, 100),
    value: item.id,
    default: session.selected.has(item.id),
  }));
  const required = normalizeSelection(session.snapshot, session.selected);
  const roles = dependencyRoleIds(session.snapshot, session.selected);
  return {
    embeds: [embed('🧭 Select Source Structure', [
      `**Source:** ${session.snapshot?.sourceGuild?.name || session.sourceGuildId}`,
      `**Destination:** ${guildLabel(session, session.destinationGuildId)}`,
      `**Page:** ${page.safePage + 1}/${page.pageCount}`,
      '',
      `Selected: **${session.selected.size}** explicit items • **${required.size}** including required parents • **${roles.size}** permission role dependencies`,
      '',
      'Selecting a category selects its children. Selecting a channel automatically carries its parent category.',
    ].join('\n'))],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(session, 'items')).setPlaceholder('Choose categories/channels on this page').setMinValues(0).setMaxValues(options.length).addOptions(options)),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(componentId(session, 'prev')).setLabel('Previous').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(page.safePage === 0),
        new ButtonBuilder().setCustomId(componentId(session, 'next')).setLabel('Next').setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(page.safePage >= page.pageCount - 1),
        new ButtonBuilder().setCustomId(componentId(session, 'select-page')).setLabel('Select Page').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(componentId(session, 'clear-page')).setLabel('Clear Page').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(componentId(session, 'review')).setLabel('Review Transfer').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(session.selected.size === 0),
        new ButtonBuilder().setCustomId(componentId(session, 'select-all')).setLabel('Select All').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(componentId(session, 'back')).setLabel('Back').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}
function reviewPayload(session, dryRun = null) {
  const snap = filteredSnapshot(session.snapshot, session.selected);
  const roleNames = [...snap.roles.map((role) => `• ${role.name}`), ...(snap.managedRoles || []).map((role) => `• 🔗 ${role.name} (managed → remap only)`)].slice(0, 15).join('\n') || '• None';
  const dry = dryRun ? [
    '', '**Dry Run**', `Status: \`${dryRun.status || 'dry-run'}\``,
    `Would create/reuse: Roles \`${dryRun.copied?.roles || 0}\` • Categories \`${dryRun.copied?.categories || 0}\` • Channels \`${dryRun.copied?.channels || 0}\` • Permissions \`${dryRun.copied?.permissionOverwrites || 0}\``,
    ...(dryRun.errors || []).slice(0, 4).map((e) => `⚠️ ${e}`),
  ] : [];
  return {
    embeds: [embed('🧾 Selective Transfer Plan', [
      `**Source:** ${session.snapshot?.sourceGuild?.name || session.sourceGuildId}`,
      `**Destination:** ${guildLabel(session, session.destinationGuildId)}`,
      '', `Categories: **${snap.stats.categories}**`, `Channels: **${snap.stats.channels}**`,
      `Required role dependencies: **${snap.stats.roleDependencies ?? snap.stats.roles}**`, `Managed role remaps: **${snap.stats.managedRoles || 0}**`, `Permission overwrites: **${snap.stats.permissionOverwrites}**`,
      '', '**Roles carried/mapped because selected permissions depend on them:**', roleNames, ...dry,
    ].join('\n'), dryRun?.errors?.length ? 0xf59e0b : 0x5865f2)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(componentId(session, 'dryrun')).setLabel('Run Dry-Run').setEmoji('🧪').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(componentId(session, 'confirm-view')).setLabel('Continue').setEmoji('➡️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(componentId(session, 'scan-back')).setLabel('Back to Selection').setStyle(ButtonStyle.Secondary),
    )],
  };
}
function confirmPayload(session) {
  const snap = filteredSnapshot(session.snapshot, session.selected);
  return {
    embeds: [embed('⚠️ Confirm Selective Copy', [
      `**Source:** ${session.snapshot?.sourceGuild?.name || session.sourceGuildId}`,
      `**Destination:** ${guildLabel(session, session.destinationGuildId)}`,
      '',
      `This will transfer **${snap.stats.categories} categories**, **${snap.stats.channels} channels**, **${snap.stats.roleDependencies ?? snap.stats.roles} required role dependencies** (${snap.stats.managedRoles || 0} managed/remapped), and rebuild **${snap.stats.permissionOverwrites} permission overwrites**.`,
      '', 'Missing permission roles are created before channel/category overwrites are applied.',
    ].join('\n'), 0xf59e0b)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(componentId(session, 'copy-now')).setLabel('Confirm Copy').setEmoji('⚠️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(componentId(session, 'review-back')).setLabel('Back').setStyle(ButtonStyle.Secondary),
    )],
  };
}
async function applyFiltered(interaction, session, dryRun) {
  const environment = destinationEnvironment(interaction, session, session.destinationGuildId);
  const snapshot = filteredSnapshot(session.snapshot, session.selected);
  return bridgeRequest(environment, 'POST', '/apply', {
    guildId: session.destinationGuildId,
    session: { dryRun, conflictMode: 'skip', destinationGuildId: session.destinationGuildId },
    snapshot,
    title: dryRun ? 'Selective Copy Dry-Run' : 'Selective Copy',
    actorId: interaction.user.id,
  });
}
function destinationMappings(sourceSnapshot, destinationSnapshot, selected) {
  const filtered = filteredSnapshot(sourceSnapshot, selected);
  const standardRoleMappings = filtered.roles.map((role) => {
    const candidates = (destinationSnapshot.roles || []).filter((dest) => dest.name === role.name);
    return {
      sourceId: role.id, sourceName: role.name, sourcePermissions: role.permissions,
      destinationId: candidates.length === 1 ? candidates[0].id : null,
      destinationName: candidates.length === 1 ? candidates[0].name : null,
      status: candidates.length === 1 ? 'mapped' : candidates.length > 1 ? 'ambiguous' : 'missing',
    };
  });
  const managedRoleMappings = (filtered.managedRoles || []).map((role) => {
    const managed = destinationSnapshot.managedRoles || [];
    let candidates = [];
    if (role.tags?.botId && role.tags.botId === filtered.sourceGuild?.botUserId && destinationSnapshot.sourceGuild?.botUserId) {
      candidates = managed.filter((dest) => dest.tags?.botId === destinationSnapshot.sourceGuild.botUserId);
    }
    if (!candidates.length && role.tags?.botId) candidates = managed.filter((dest) => dest.tags?.botId === role.tags.botId);
    if (!candidates.length) candidates = managed.filter((dest) => dest.name === role.name);
    const match = candidates.length === 1 ? candidates[0] : null;
    return {
      sourceId: role.id,
      sourceName: role.name,
      sourcePermissions: role.permissions,
      managed: true,
      destinationId: match?.id || null,
      destinationName: match?.name || null,
      status: match ? 'mapped' : candidates.length > 1 ? 'ambiguous-managed' : 'missing-managed',
    };
  });
  const roleMappings = [...standardRoleMappings, ...managedRoleMappings];
  const categoryMap = new Map();
  for (const source of filtered.channels.filter((c) => c.type === ChannelType.GuildCategory)) {
    const candidates = (destinationSnapshot.channels || []).filter((dest) => dest.type === ChannelType.GuildCategory && dest.name === source.name);
    if (candidates.length === 1) categoryMap.set(source.id, candidates[0].id);
  }
  const channelMappings = filtered.channels.map((source) => {
    let candidates = (destinationSnapshot.channels || []).filter((dest) => dest.name === source.name);
    if (source.type === ChannelType.GuildCategory) candidates = candidates.filter((dest) => dest.type === ChannelType.GuildCategory);
    else if (source.parentId && categoryMap.get(source.parentId)) candidates = candidates.filter((dest) => dest.parentId === categoryMap.get(source.parentId));
    const match = candidates.length === 1 ? candidates[0] : null;
    return {
      sourceId: source.id, sourceName: source.name, sourceParentId: source.parentId || null,
      destinationId: match?.id || null, destinationName: match?.name || null,
      destinationParentId: match?.parentId || null, permissionOverwrites: source.permissionOverwrites || [],
      status: match ? 'mapped' : candidates.length > 1 ? 'ambiguous' : 'missing',
    };
  });
  return { roleMappings, channelMappings };
}
function copyOutcome(response, mappings) {
  const status = String(response?.log?.status || 'unknown');
  const created = response?.log?.transferObjects || {};
  const changed = (created.createdChannelIds || []).length + (created.createdCategoryIds || []).length + (created.createdRoleIds || []).length;
  const unresolved = [...mappings.roleMappings, ...mappings.channelMappings].filter((item) => item.status !== 'mapped').length;
  if (status === 'success' && !unresolved) return 'success';
  if (status === 'failed' || (!changed && (response?.log?.errors || []).length)) return 'failed';
  if (!changed && status !== 'success') return 'no-changes';
  return 'partial';
}

async function recordTransfer(interaction, session, response) {
  const environment = destinationEnvironment(interaction, session, session.destinationGuildId);
  const destinationSnapshot = (await bridgeRequest(environment, 'POST', '/snapshot', {
    guildId: session.destinationGuildId,
    selectedOptions: ['roles', 'categories', 'channels', 'permissions'],
  })).snapshot;
  const filtered = filteredSnapshot(session.snapshot, session.selected);
  const mappings = destinationMappings(session.snapshot, destinationSnapshot, session.selected);
  const transferObjects = response.log?.transferObjects || {};
  const createdRoles = new Set((transferObjects.createdRoleIds || []).map(String));
  const createdStructure = new Set([...(transferObjects.createdCategoryIds || []), ...(transferObjects.createdChannelIds || [])].map(String));
  for (const item of mappings.roleMappings) item.createdByTransfer = Boolean(item.destinationId && createdRoles.has(String(item.destinationId)));
  for (const item of mappings.channelMappings) item.createdByTransfer = Boolean(item.destinationId && createdStructure.has(String(item.destinationId)));
  const outcome = copyOutcome(response, mappings);
  const manifest = history.add(session.controlGuildId, {
    type: 'selective-copy', sourceGuildId: session.sourceGuildId,
    sourceGuildName: session.snapshot?.sourceGuild?.name || null,
    destinationGuildId: session.destinationGuildId,
    destinationGuildName: destinationSnapshot?.sourceGuild?.name || response.guild?.name || null,
    environment, status: response.log?.status || 'unknown', outcome,
    rollbackBackupId: response.log?.rollbackBackupId || null,
    selectedSourceChannelIds: [...normalizeSelection(session.snapshot, session.selected)], stats: filtered.stats,
    roles: mappings.roleMappings, channels: mappings.channelMappings,
    transferObjects: {
      createdRoleIds: [...createdRoles],
      createdCategoryIds: [...new Set((transferObjects.createdCategoryIds || []).map(String))],
      createdChannelIds: [...new Set((transferObjects.createdChannelIds || []).map(String))],
    },
    warnings: response.log?.errors || [], notes: response.log?.notes || [],
  }, interaction.guild);
  session.lastManifestId = manifest.id;
  return manifest;
}
function resultPayload(session, response, manifest) {
  const unresolvedRoles = manifest.roles.filter((item) => item.status !== 'mapped').length;
  const unresolvedChannels = manifest.channels.filter((item) => item.status !== 'mapped').length;
  const status = response.log?.status || 'unknown';
  const ok = status === 'success' && !unresolvedRoles && !unresolvedChannels;
  return {
    embeds: [embed(ok ? '✅ Selective Copy Verified' : '⚠️ Selective Copy Completed', [
      `**Transfer:** \`${manifest.id}\``, `**Destination:** ${manifest.destinationGuildName || manifest.destinationGuildId} (${manifest.destinationGuildId})`,
      `**Status:** \`${status}\``, '',
      `Transfer plan: Categories \`${manifest.stats.categories}\` • Channels \`${manifest.stats.channels}\` • Required Roles \`${manifest.stats.roles}\` • Permission Overwrites \`${manifest.stats.permissionOverwrites}\``,
      `Manifest mapping: Roles \`${manifest.roles.length - unresolvedRoles}/${manifest.roles.length}\` • Structure \`${manifest.channels.length - unresolvedChannels}/${manifest.channels.length}\``,
      '', 'This transfer is permanently recorded in **Transfer History** with source → destination IDs and source permission data.',
      ...(manifest.warnings || []).slice(0, 5).map((warning) => `⚠️ ${warning}`),
    ].join('\n'), ok ? 0x22c55e : 0xf59e0b)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(componentId(session, 'manifest-last')).setLabel('View Transfer Manifest').setEmoji('📜').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(componentId(session, 'home')).setLabel('New Transfer').setStyle(ButtonStyle.Secondary),
    )],
  };
}
function inferOutcome(item) {
  if (item?.outcome) return item.outcome;
  if (item?.status === 'undone') return 'undone';
  if (item?.type === 'bulk-delete') {
    if ((item.deletedCount || 0) === 0 && !(item.failed || []).length) return 'no-changes';
    if ((item.failed || []).length) return (item.deletedCount || 0) ? 'partial' : 'failed';
    return (item.deletedCount || 0) ? 'success' : 'no-changes';
  }
  const status = String(item?.status || '').toLowerCase();
  if (status === 'success') return 'success';
  if (status === 'failed') return 'failed';
  if (status.includes('warning') || status.includes('partial')) return 'partial';
  return 'recorded';
}
function outcomeMeta(outcome) {
  return ({
    success: ['🟢', 'SUCCESS'], partial: ['🟠', 'PARTIAL'], failed: ['🔴', 'FAILED'],
    'no-changes': ['⚪', 'NO CHANGES'], undone: ['↩️', 'UNDONE'], recorded: ['⚪', 'RECORDED'],
  })[outcome] || ['⚪', String(outcome || 'RECORDED').toUpperCase()];
}
function historyPayload(session, notice = null) {
  const entries = history.list(session.controlGuildId, 25);
  const lines = entries.slice(0, 10).map((item) => {
    const stats = item.stats || {};
    const outcome = inferOutcome(item); const [icon, label] = outcomeMeta(outcome);
    const operation = item.type === 'bulk-delete' ? 'DELETE' : 'COPY';
    const count = item.type === 'bulk-delete' ? `${item.deletedCount || 0}/${item.requestedCount ?? item.deletedCount ?? 0} removed` : `${stats.channels ?? 0} channels`;
    return `${icon} **${item.id}** • **${operation} ${label}** • ${item.sourceGuildName || item.sourceGuildId || 'n/a'} → ${item.destinationGuildName || item.destinationGuildId || 'n/a'} • ${count}`;
  });
  const components = [];
  if (entries.length) components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(session, 'history-pick')).setPlaceholder('Open transfer/history record').addOptions(entries.map((item) => {
    const [, label] = outcomeMeta(inferOutcome(item));
    return { label: `${item.id} • ${label}`.slice(0, 100), description: `${item.type || 'transfer'} • ${item.destinationGuildName || item.destinationGuildId || 'destination'}`.slice(0, 100), value: item.id };
  }))));
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(componentId(session, 'history-clear-junk')).setLabel('Clear Failed / No Changes').setStyle(ButtonStyle.Secondary).setDisabled(!entries.some((item) => ['failed', 'no-changes'].includes(inferOutcome(item)))),
    new ButtonBuilder().setCustomId(componentId(session, 'history-clear-undone')).setLabel('Clear Undone').setStyle(ButtonStyle.Secondary).setDisabled(!entries.some((item) => inferOutcome(item) === 'undone')),
    new ButtonBuilder().setCustomId(componentId(session, 'history-clear-all-view')).setLabel('Clear All History').setStyle(ButtonStyle.Danger).setDisabled(!entries.length),
  ));
  components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(componentId(session, 'home')).setLabel('Back').setStyle(ButtonStyle.Secondary)));
  return { embeds: [embed('📜 Duplicator Transfer History', [notice ? `**${notice}**` : null, notice ? '' : null, ...(lines.length ? lines : ['No transfer manifests have been recorded yet.'])].filter(Boolean).join('\n'))], components };
}
function createdUndoObjects(manifest) {
  if (manifest?.transferObjects) return {
    createdRoleIds: manifest.transferObjects.createdRoleIds || [],
    createdCategoryIds: manifest.transferObjects.createdCategoryIds || [],
    createdChannelIds: manifest.transferObjects.createdChannelIds || [],
  };
  return {
    createdRoleIds: (manifest.roles || []).filter((item) => item.createdByTransfer === true).map((item) => item.destinationId).filter(Boolean),
    createdCategoryIds: [],
    createdChannelIds: (manifest.channels || []).filter((item) => item.createdByTransfer === true).map((item) => item.destinationId).filter(Boolean),
  };
}
function canUndoManifest(manifest) {
  const objects = createdUndoObjects(manifest);
  return manifest?.type === 'selective-copy' && inferOutcome(manifest) !== 'undone' && (objects.createdRoleIds.length + objects.createdCategoryIds.length + objects.createdChannelIds.length > 0);
}
function manifestPayload(session, manifest) {
  const roleLines = (manifest.roles || []).slice(0, 12).map((item) => `• ${item.createdByTransfer ? '🆕 ' : ''}${item.sourceName} \`${item.sourceId}\` → ${item.destinationId ? `\`${item.destinationId}\`` : `**${item.status}**`}`);
  const channelLines = (manifest.channels || []).slice(0, 16).map((item) => `• ${item.createdByTransfer ? '🆕 ' : ''}${item.sourceName} \`${item.sourceId}\` → ${item.destinationId ? `\`${item.destinationId}\`` : `**${item.status}**`}`);
  const outcome = inferOutcome(manifest); const [icon, label] = outcomeMeta(outcome);
  const legacy = manifest.type === 'selective-copy' && !manifest.transferObjects && !(manifest.channels || []).some((item) => item.createdByTransfer === true);
  return {
    embeds: [embed(`📜 Transfer ${manifest.id}`, [
      `**Outcome:** ${icon} ${label}`, `**Type:** ${manifest.type || 'transfer'}`, `**Created:** ${manifest.createdAt || 'unknown'}`,
      `**Source:** ${manifest.sourceGuildName || manifest.sourceGuildId || 'n/a'} (${manifest.sourceGuildId || 'n/a'})`,
      `**Destination:** ${manifest.destinationGuildName || manifest.destinationGuildId || 'n/a'} (${manifest.destinationGuildId || 'n/a'})`,
      `**Engine status:** ${manifest.status || 'recorded'}`, manifest.rollbackBackupId ? `**Rollback Backup:** \`${manifest.rollbackBackupId}\`` : null,
      manifest.undo?.removed != null ? `**Undo:** removed ${manifest.undo.removed}/${manifest.undo.requested} objects` : null,
      legacy ? '⚠️ **Legacy record:** exact created-object ownership was not stored, so automatic Undo is disabled. Deleting this history record is still safe.' : null,
      '', '**Role mappings**', ...(roleLines.length ? roleLines : ['• None']), '', '**Category / channel mappings**', ...(channelLines.length ? channelLines : ['• None']),
      (manifest.channels || []).length > 16 ? `…and ${(manifest.channels || []).length - 16} more structure mappings.` : null,
      '', `Stored permission overwrites: **${(manifest.channels || []).reduce((sum, item) => sum + (item.permissionOverwrites || []).length, 0)}**`,
    ].filter(Boolean).join('\n'))],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(componentId(session, 'history')).setLabel('Back to History').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(componentId(session, `undo-view:${manifest.id}`)).setLabel(legacy ? 'Undo Unavailable (Legacy)' : 'Undo Transfer').setEmoji('↩️').setStyle(ButtonStyle.Danger).setDisabled(!canUndoManifest(manifest)),
      new ButtonBuilder().setCustomId(componentId(session, `history-delete-view:${manifest.id}`)).setLabel('Delete History Record').setEmoji('🗑️').setStyle(ButtonStyle.Secondary),
    )],
  };
}
function deleteHistoryConfirmPayload(session, manifest) {
  return {
    embeds: [embed('🗑️ Delete History Record?', [
      `**Record:** \`${manifest.id}\``, `**Outcome:** ${outcomeMeta(inferOutcome(manifest)).join(' ')}`, '',
      'This removes only the saved Duplicator history record.', '**No Discord channels, categories or roles will be changed.**',
    ].join('\n'), 0xed4245)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(componentId(session, `history-delete-now:${manifest.id}`)).setLabel('Delete Record Only').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(componentId(session, 'history')).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    )],
  };
}
function clearAllHistoryConfirmPayload(session) {
  return {
    embeds: [embed('🗑️ Clear All Duplicator History?', 'This removes all saved Duplicator history records for this control server.\n\n**It does not delete or change anything in Discord.**', 0xed4245)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(componentId(session, 'history-clear-all-now')).setLabel('Clear History Only').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(componentId(session, 'history')).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    )],
  };
}
async function inspectManifestUndo(interaction, session, manifest) {
  const environment = destinationEnvironment(interaction, session, manifest.destinationGuildId);
  return bridgeRequest(environment, 'POST', '/undo-inspect', { guildId: manifest.destinationGuildId, objects: createdUndoObjects(manifest) });
}
function undoPreviewPayload(session, manifest, inspection) {
  const unsafe = [...(inspection.channels || []), ...(inspection.roles || [])].filter((item) => item.state === 'unsafe');
  const missing = inspection.counts?.missing || 0;
  return {
    embeds: [embed('↩️ Review Transfer Undo', [
      `**Transfer:** \`${manifest.id}\``, `**Destination:** ${manifest.destinationGuildName || manifest.destinationGuildId}`,
      '', `Created objects recorded: **${inspection.counts?.total || 0}**`, `Still present and safe to remove: **${inspection.counts?.present || 0}**`, `Already missing: **${missing}**`, `Unsafe / preserved: **${inspection.counts?.unsafe || 0}**`,
      '', 'Undo removes only exact destination IDs recorded as **created by this transfer**. Reused/pre-existing objects are never removed.',
      ...(unsafe.slice(0, 6).map((item) => `⚠️ ${item.name || item.id}: ${item.reason}`)),
    ].join('\n'), unsafe.length ? 0xf59e0b : 0xed4245)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(componentId(session, `undo-now:${manifest.id}`)).setLabel('Confirm Undo').setEmoji('↩️').setStyle(ButtonStyle.Danger).setDisabled(!(inspection.counts?.present > 0)),
      new ButtonBuilder().setCustomId(componentId(session, 'history')).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    )],
  };
}
async function prepareDeleteScan(interaction, session) {
  const guild = interaction.client.guilds.cache.get(session.destinationGuildId);
  if (!guild) throw new Error('Bulk Delete is DEV-local only. Select a destination connected to the DEV bot.');
  await guild.channels.fetch().catch(() => null);

  const all = [...guild.channels.cache.values()];
  const byPosition = (a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0);
  const output = [];

  // Mirror Discord: uncategorised channels first, in their live sidebar order.
  for (const channel of all.filter((c) => c.type !== ChannelType.GuildCategory && !c.parentId).sort(byPosition)) {
    output.push({ id: channel.id, name: channel.name, type: channel.type, parentId: null, itemKind: 'channel' });
  }

  // Then each category followed immediately by its children, all using live Discord positions.
  for (const category of all.filter((c) => c.type === ChannelType.GuildCategory).sort(byPosition)) {
    output.push({ id: category.id, name: category.name, type: category.type, parentId: null, itemKind: 'category' });
    for (const child of all.filter((c) => c.parentId === category.id).sort(byPosition)) {
      output.push({ id: child.id, name: child.name, type: child.type, parentId: category.id, itemKind: 'channel' });
    }
  }

  // Keep any orphan/nonstandard channel visible instead of silently dropping it.
  const included = new Set(output.map((item) => item.id));
  for (const channel of all.filter((c) => c.type !== ChannelType.GuildCategory && !included.has(c.id)).sort(byPosition)) {
    output.push({ id: channel.id, name: channel.name, type: channel.type, parentId: channel.parentId || null, itemKind: 'channel' });
  }

  session.deleteItems = output;
  session.deleteSelected = new Set();
  session.deletePage = 0;
}
function deletePayload(session) {
  if (!session.deleteItems.length) return { embeds: [embed('🗑️ Bulk Delete Channels', 'No deletable channels were found.', 0xed4245)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(componentId(session, 'home')).setLabel('Back').setStyle(ButtonStyle.Secondary))] };
  const page = pageSlice(session.deleteItems, session.deletePage);
  session.deletePage = page.safePage;
  const options = page.items.map((item) => ({
    label: `${item.itemKind === 'category' ? 'CATEGORY • ' : ''}${item.name}`.slice(0, 100),
    description: `${typeEmoji(item)} ${item.id}`.slice(0, 100), value: item.id, default: session.deleteSelected.has(item.id),
  }));
  return {
    embeds: [embed('🗑️ Bulk Delete Channels', [
      `**Destination:** ${guildLabel(session, session.destinationGuildId)}`, `**Page:** ${page.safePage + 1}/${page.pageCount}`, `**Selected:** ${session.deleteSelected.size}`,
      '', 'Select categories/channels to delete. A category includes its children. Nothing is deleted until the final red confirmation.',
    ].join('\n'), 0xed4245)],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(session, 'delete-items')).setPlaceholder('Select channels/categories to delete').setMinValues(0).setMaxValues(options.length).addOptions(options)),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(componentId(session, 'delete-prev')).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page.safePage === 0),
        new ButtonBuilder().setCustomId(componentId(session, 'delete-next')).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page.safePage >= page.pageCount - 1),
        new ButtonBuilder().setCustomId(componentId(session, 'delete-select-page')).setLabel('Select Page').setStyle(ButtonStyle.Secondary),
        ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(componentId(session, 'delete-clear-page')).setLabel('Clear Page').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(componentId(session, 'delete-review')).setLabel('Review Selected').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(session.deleteSelected.size === 0),
        new ButtonBuilder().setCustomId(componentId(session, 'home')).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}
function deleteConfirmPayload(session, ids = null, manifestId = null) {
  const selected = ids ? new Set(ids) : session.deleteSelected;
  const names = (session.deleteItems || []).filter((item) => selected.has(item.id)).slice(0, 15).map((item) => `• ${item.itemKind === 'category' ? '📁' : typeEmoji(item)} ${item.name}`).join('\n');
  return {
    embeds: [embed('⚠️ Confirm Bulk Delete', [
      `**Destination:** ${guildLabel(session, session.destinationGuildId)}`, `**Objects selected:** ${selected.size}`,
      manifestId ? `**Transfer manifest:** \`${manifestId}\`` : null, '', names || 'Stored transfer objects will be removed by destination ID.',
      selected.size > 15 ? `…and ${selected.size - 15} more.` : null, '', '**This action permanently deletes Discord channels/categories.**',
    ].filter(Boolean).join('\n'), 0xed4245)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(componentId(session, manifestId ? `delete-manifest-now:${manifestId}` : 'delete-now')).setLabel('Confirm Delete').setEmoji('⚠️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(componentId(session, manifestId ? 'history' : 'delete-back')).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    )],
  };
}
async function deleteIds(interaction, session, ids, sourceManifestId = null) {
  const guild = interaction.client.guilds.cache.get(session.destinationGuildId);
  if (!guild) throw new Error('Bulk Delete is DEV-local only for safety.');
  await guild.channels.fetch().catch(() => null);
  const requestedIds = [...new Set((ids || []).map(String))];
  const selected = new Set(requestedIds);
  const channels = [...guild.channels.cache.values()].filter((channel) => selected.has(channel.id));
  const foundIds = new Set(channels.map((channel) => channel.id));
  const missing = requestedIds.filter((id) => !foundIds.has(id)).map((id) => ({ id, reason: 'Already missing or no longer resolvable.' }));
  const nonCategories = channels.filter((c) => c.type !== ChannelType.GuildCategory).sort((a, b) => b.position - a.position);
  const categories = channels.filter((c) => c.type === ChannelType.GuildCategory).sort((a, b) => b.position - a.position);
  const deleted = [], failed = [];
  for (const channel of [...nonCategories, ...categories]) {
    try {
      const id = channel.id, name = channel.name, type = channel.type;
      await channel.delete(`Goliath Duplicator bulk delete by ${interaction.user.id}`);
      const stillThere = await guild.channels.fetch(id).catch(() => null);
      if (stillThere) throw new Error('Post-delete verification found the channel still present.');
      deleted.push({ id, name, type });
    } catch (error) { failed.push({ id: channel.id, name: channel.name, error: error.message || String(error) }); }
  }
  const outcome = failed.length ? (deleted.length ? 'partial' : 'failed') : deleted.length ? (missing.length ? 'partial' : 'success') : 'no-changes';
  const manifest = history.add(session.controlGuildId, {
    type: 'bulk-delete', destinationGuildId: guild.id, destinationGuildName: guild.name,
    status: outcome === 'success' ? 'success' : outcome === 'partial' ? 'completed-with-warnings' : outcome,
    outcome, requestedCount: requestedIds.length, deletedCount: deleted.length, deleted, missing, failed, sourceManifestId,
  }, interaction.guild);
  return manifest;
}
async function startCopy(interaction) {
  if (mode() !== 'DEV') return interaction.reply({ content: '❌ Selective Duplicator is DEV-only.', flags: MessageFlags.Ephemeral });
  if (!core) throw new Error('Duplicator core is not configured.');
  const access = core.assertAccess(interaction);
  if (!access.allowed) return interaction.reply({ content: `❌ ${access.reason}`, flags: MessageFlags.Ephemeral });
  core.initializeBridge(interaction.client);
  const session = makeSession(interaction);
  session.directory = await core.getGuildDirectory(interaction.client);
  return interaction.reply(landingPayload(session));
}
async function handleInteraction(interaction) {
  const parsed = parseId(interaction?.customId);
  if (!parsed) return false;
  const session = sessionFor(interaction, parsed.sessionId);
  if (!session) {
    await interaction.reply({ content: '❌ Selective Duplicator session expired.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }
  try {
    const action = parsed.action;
    if (action === 'source') {
      session.sourceGuildId = interaction.values?.[0] || null; session.snapshot = null; session.selected.clear();
      await interaction.update(landingPayload(session)); return true;
    }
    if (action === 'destination') {
      session.destinationGuildId = interaction.values?.[0] || null;
      await interaction.update(landingPayload(session)); return true;
    }
    if (action === 'home' || action === 'back') {
      session.snapshot = null; session.selected.clear();
      await interaction.update(landingPayload(session)); return true;
    }
    if (action === 'scan') {
      await interaction.deferUpdate();
      session.snapshot = await snapshotFor(interaction, session, session.sourceGuildId); session.selected.clear(); session.page = 0;
      await interaction.editReply(scanPayload(session)); return true;
    }
    if (action === 'items') {
      const page = pageSlice(orderedSnapshotItems(session.snapshot), session.page);
      const selectedNow = new Set(interaction.values || []);
      for (const item of page.items) {
        if (!selectedNow.has(item.id)) {
          session.selected.delete(item.id);
          if (item.itemKind === 'category') for (const childId of categoryChildren(session.snapshot, item.id)) session.selected.delete(childId);
        }
      }
      for (const id of selectedNow) {
        session.selected.add(id);
        const item = page.items.find((entry) => entry.id === id);
        if (item?.itemKind === 'category') for (const childId of categoryChildren(session.snapshot, id)) session.selected.add(childId);
        if (item?.parentId) session.selected.add(item.parentId);
      }
      await interaction.update(scanPayload(session)); return true;
    }
    if (action === 'prev' || action === 'next') {
      session.page += action === 'next' ? 1 : -1;
      await interaction.update(scanPayload(session)); return true;
    }
    if (action === 'select-page' || action === 'clear-page') {
      const items = pageSlice(orderedSnapshotItems(session.snapshot), session.page).items;
      for (const item of items) {
        if (action === 'select-page') {
          session.selected.add(item.id);
          if (item.itemKind === 'category') for (const childId of categoryChildren(session.snapshot, item.id)) session.selected.add(childId);
          if (item.parentId) session.selected.add(item.parentId);
        } else {
          session.selected.delete(item.id);
          if (item.itemKind === 'category') for (const childId of categoryChildren(session.snapshot, item.id)) session.selected.delete(childId);
        }
      }
      await interaction.update(scanPayload(session)); return true;
    }
    if (action === 'select-all') {
      session.selected = new Set((session.snapshot?.channels || []).map((channel) => channel.id));
      await interaction.update(scanPayload(session)); return true;
    }
    if (action === 'review') { await interaction.update(reviewPayload(session)); return true; }
    if (action === 'scan-back') { await interaction.update(scanPayload(session)); return true; }
    if (action === 'dryrun') {
      await interaction.deferUpdate();
      const response = await applyFiltered(interaction, session, true);
      await interaction.editReply(reviewPayload(session, response.log)); return true;
    }
    if (action === 'confirm-view') { await interaction.update(confirmPayload(session)); return true; }
    if (action === 'review-back') { await interaction.update(reviewPayload(session)); return true; }
    if (action === 'copy-now') {
      await interaction.deferUpdate();
      const response = await applyFiltered(interaction, session, false);
      const manifest = await recordTransfer(interaction, session, response);
      await interaction.editReply(resultPayload(session, response, manifest)); return true;
    }
    if (action === 'history') { await interaction.update(historyPayload(session)); return true; }
    if (action === 'history-pick') {
      const manifest = history.get(session.controlGuildId, interaction.values?.[0]);
      if (!manifest) throw new Error('Transfer manifest not found.');
      session.lastManifestId = manifest.id; session.destinationGuildId = manifest.destinationGuildId || session.destinationGuildId;
      await interaction.update(manifestPayload(session, manifest)); return true;
    }
    if (action === 'manifest-last') {
      const manifest = history.get(session.controlGuildId, session.lastManifestId);
      if (!manifest) throw new Error('Transfer manifest not found.');
      await interaction.update(manifestPayload(session, manifest)); return true;
    }
    if (action === 'history-clear-junk') {
      const removed = history.clearWhere(session.controlGuildId, (item) => ['failed', 'no-changes'].includes(inferOutcome(item)), interaction.guild);
      await interaction.update(historyPayload(session, `Removed ${removed.length} failed/no-change record(s). Discord was not changed.`)); return true;
    }
    if (action === 'history-clear-undone') {
      const removed = history.clearWhere(session.controlGuildId, (item) => inferOutcome(item) === 'undone', interaction.guild);
      await interaction.update(historyPayload(session, `Removed ${removed.length} undone record(s). Discord was not changed.`)); return true;
    }
    if (action === 'history-clear-all-view') { await interaction.update(clearAllHistoryConfirmPayload(session)); return true; }
    if (action === 'history-clear-all-now') {
      const removed = history.clearWhere(session.controlGuildId, () => true, interaction.guild);
      await interaction.update(historyPayload(session, `Cleared ${removed.length} history record(s). Discord was not changed.`)); return true;
    }
    if (action.startsWith('history-delete-view:')) {
      const manifest = history.get(session.controlGuildId, action.split(':')[1]);
      if (!manifest) throw new Error('History record not found.');
      await interaction.update(deleteHistoryConfirmPayload(session, manifest)); return true;
    }
    if (action.startsWith('history-delete-now:')) {
      const id = action.split(':')[1];
      const removed = history.remove(session.controlGuildId, id, interaction.guild);
      await interaction.update(historyPayload(session, removed ? `Deleted history record ${id}. Discord was not changed.` : `Record ${id} was already missing.`)); return true;
    }
    if (action.startsWith('undo-view:')) {
      const manifest = history.get(session.controlGuildId, action.split(':')[1]);
      if (!manifest) throw new Error('Transfer manifest not found.');
      if (!canUndoManifest(manifest)) throw new Error('This transfer cannot be safely auto-undone. Legacy transfers did not store exact created-object ownership.');
      session.destinationGuildId = manifest.destinationGuildId;
      await interaction.deferUpdate();
      const inspection = await inspectManifestUndo(interaction, session, manifest);
      await interaction.editReply(undoPreviewPayload(session, manifest, inspection)); return true;
    }
    if (action.startsWith('undo-now:')) {
      const id = action.split(':')[1];
      const manifest = history.get(session.controlGuildId, id);
      if (!manifest) throw new Error('Transfer manifest not found.');
      if (!canUndoManifest(manifest)) throw new Error('This transfer cannot be safely auto-undone.');
      session.destinationGuildId = manifest.destinationGuildId;
      const environment = destinationEnvironment(interaction, session, manifest.destinationGuildId);
      await interaction.deferUpdate();
      const undo = await bridgeRequest(environment, 'POST', '/undo-apply', { guildId: manifest.destinationGuildId, objects: createdUndoObjects(manifest), actorId: interaction.user.id });
      const outcome = undo.outcome === 'undone' ? 'undone' : undo.outcome;
      const status = outcome === 'undone' ? 'undone' : `undo-${outcome}`;
      const updated = history.update(session.controlGuildId, id, { outcome, status, undoneAt: new Date().toISOString(), undo }, interaction.guild);
      const color = outcome === 'undone' ? 0x22c55e : outcome === 'partial' ? 0xf59e0b : 0xed4245;
      await interaction.editReply({
        embeds: [embed(outcome === 'undone' ? '↩️ Transfer Undone' : '⚠️ Transfer Undo Incomplete', [
`**Transfer:** \`${id}\``, `**Outcome:** ${outcomeMeta(outcome).join(' ')}`, `Removed: **${undo.removed}/${undo.requested}** recorded created objects`,
`Already missing before undo: **${undo.before?.counts?.missing || 0}**`, `Unsafe/preserved: **${undo.before?.counts?.unsafe || 0}**`,
`Deletion failures: **${(undo.failedChannels || []).length + (undo.failedRoles || []).length}**`, '',
'The original transfer record was updated in place; no extra delete-transfer record was created.',
        ].join('\n'), color)],
        components: [new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId(componentId(session, 'history')).setLabel('Back to History').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId(componentId(session, 'manifest-last')).setLabel('View Updated Record').setStyle(ButtonStyle.Secondary),
        )],
      });
      session.lastManifestId = updated?.id || id;
      return true;
    }
    if (action === 'delete-scan') {
      await interaction.deferUpdate(); await prepareDeleteScan(interaction, session);
      await interaction.editReply(deletePayload(session)); return true;
    }
    if (action === 'delete-items') {
      const page = pageSlice(session.deleteItems, session.deletePage);
      const selectedNow = new Set(interaction.values || []);
      for (const item of page.items) {
        if (!selectedNow.has(item.id)) {
          session.deleteSelected.delete(item.id);
          if (item.itemKind === 'category') for (const child of session.deleteItems.filter((entry) => entry.parentId === item.id)) session.deleteSelected.delete(child.id);
        }
      }
      for (const id of selectedNow) {
        session.deleteSelected.add(id);
        const item = page.items.find((entry) => entry.id === id);
        if (item?.itemKind === 'category') for (const child of session.deleteItems.filter((entry) => entry.parentId === id)) session.deleteSelected.add(child.id);
      }
      await interaction.update(deletePayload(session)); return true;
    }
    if (action === 'delete-prev' || action === 'delete-next') {
      session.deletePage += action === 'delete-next' ? 1 : -1;
      await interaction.update(deletePayload(session)); return true;
    }
    if (action === 'delete-select-page' || action === 'delete-clear-page') {
      const page = pageSlice(session.deleteItems, session.deletePage);
      for (const item of page.items) {
        if (action === 'delete-select-page') {
          session.deleteSelected.add(item.id);
          if (item.itemKind === 'category') for (const child of session.deleteItems.filter((entry) => entry.parentId === item.id)) session.deleteSelected.add(child.id);
        } else {
          session.deleteSelected.delete(item.id);
          if (item.itemKind === 'category') for (const child of session.deleteItems.filter((entry) => entry.parentId === item.id)) session.deleteSelected.delete(child.id);
        }
      }
      await interaction.update(deletePayload(session)); return true;
    }
    if (action === 'delete-review') { await interaction.update(deleteConfirmPayload(session)); return true; }
    if (action === 'delete-back') { await interaction.update(deletePayload(session)); return true; }
    if (action === 'delete-now') {
      await interaction.deferUpdate();
      const manifest = await deleteIds(interaction, session, [...session.deleteSelected]);
      await interaction.editReply({
        embeds: [embed(manifest.outcome === 'success' ? '✅ Bulk Delete Verified' : '⚠️ Bulk Delete Completed', `Outcome: **${outcomeMeta(manifest.outcome).join(' ')}**\nDeleted **${manifest.deletedCount}/${manifest.requestedCount}** requested objects.\nAlready missing: **${manifest.missing?.length || 0}**\nFailed: **${manifest.failed?.length || 0}**\nHistory record: \`${manifest.id}\``, manifest.outcome === 'success' ? 0x22c55e : manifest.outcome === 'failed' ? 0xed4245 : 0xf59e0b)],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(componentId(session, 'home')).setLabel('Back to Duplicator').setStyle(ButtonStyle.Secondary))],
      }); return true;
    }
    return false;
  } catch (error) {
    console.error('[Selective Duplicator]', error);
    const payload = { content: `❌ ${error.message || String(error)}`, embeds: [], components: [] };
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => null);
    else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }
}

module.exports = { configure, startCopy, handleInteraction, filteredSnapshot, dependencyRoleIds };
