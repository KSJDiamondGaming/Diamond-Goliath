'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
  StringSelectMenuBuilder,
} = require('discord.js');

const fetch = require('node-fetch');

const security = require('../../core/security/securityCore');
const guildManager = require('../../core/guild/guildManager');
const { createServerBackup } = require('../../core/security/serverBackup');

const COPY_PREFIX = 'server-copy';
const BUILD_PREFIX = 'server-build';
const SESSION_TTL_MS = 20 * 60 * 1000;
const copySessions = new Map();
const buildSessions = new Map();

const COPY_OPTIONS = Object.freeze({
  roles: 'Roles',
  categories: 'Categories',
  channels: 'Channels',
  permissions: 'Channel Permissions',
  serverSettings: 'Server Settings + Branding',
  emojis: 'Emojis',
});

const CONFLICT_MODES = Object.freeze({
  skip: 'Skip Existing',
  rename: 'Rename Duplicates',
  replace: 'Replace Destination',
});

const REQUIRED_BOT_PERMISSIONS = [
  ['ManageGuild', PermissionFlagsBits.ManageGuild],
  ['ManageRoles', PermissionFlagsBits.ManageRoles],
  ['ManageChannels', PermissionFlagsBits.ManageChannels],
  ['ManageEmojisAndStickers', PermissionFlagsBits.ManageEmojisAndStickers],
  ['ManageWebhooks', PermissionFlagsBits.ManageWebhooks],
];

function now() {
  return new Date().toISOString();
}

function cleanId(value) {
  const id = String(value || '').trim();
  return /^\d{16,25}$/.test(id) ? id : null;
}

function splitIds(value) {
  return String(value || '')
    .split(',')
    .map((entry) => cleanId(entry))
    .filter(Boolean);
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function getAllowedOwnerIds() {
  return [...new Set([
    ...splitIds(process.env.SERVER_COPY_OWNER_IDS),
    ...splitIds(process.env.OWNER_ID),
    ...splitIds(process.env.OWNER_IDS),
    ...splitIds(process.env.BOT_OWNER_ID),
    ...splitIds(process.env.BOT_OWNER_IDS),
    ...(security.getBotOwnerIds?.() || []),
  ].filter(Boolean))];
}

function isOwnerAllowed(userId) {
  return getAllowedOwnerIds().includes(String(userId || ''));
}

function getModuleConfig(guildId) {
  try {
    return guildManager.getGuildSection(guildId, 'modules', {})?.serverCopy || {};
  } catch {
    return {};
  }
}

function assertAccess(interaction) {
  if (!interaction?.guild) return { allowed: false, reason: 'This command can only be used inside a server.' };
  if (!isOwnerAllowed(interaction.user?.id)) return { allowed: false, reason: 'This command is restricted to the bot owner.' };
  if (getModuleConfig(interaction.guild.id).enabled === false) return { allowed: false, reason: 'Server Copy is disabled for this guild.' };
  return { allowed: true };
}

function createEmbed(title, description, color = 0x5865f2) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp(new Date());
}

function getGuildById(client, guildId) {
  return client.guilds.cache.get(String(guildId || '').trim()) || null;
}

async function fetchGuildState(guild) {
  await guild.roles.fetch().catch(() => null);
  await guild.channels.fetch().catch(() => null);
  await guild.emojis.fetch().catch(() => null);
}

function guildOptions(client, selectedId = null) {
  return [...(client.guilds?.cache?.values?.() || [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25)
    .map((guild) => ({ label: guild.name.slice(0, 100), description: guild.id, value: guild.id, default: guild.id === selectedId }));
}

function customId(prefix, sessionId, action) {
  return `${prefix}:${sessionId}:${action}`;
}

function parseCustomId(value, prefix) {
  const parts = String(value || '').split(':');
  if (parts[0] !== prefix || !parts[1] || !parts[2]) return null;
  return { sessionId: parts[1], action: parts.slice(2).join(':') };
}

function cleanupSessions(map) {
  const current = Date.now();
  for (const [id, session] of map.entries()) {
    if (!session || session.expiresAt <= current) map.delete(id);
  }
}

function makeCopySession(interaction) {
  const id = `${interaction.user.id}-${Date.now().toString(36)}`;
  const session = {
    id,
    ownerId: interaction.user.id,
    controlGuildId: interaction.guild.id,
    sourceGuildId: null,
    destinationGuildId: null,
    selectedOptions: Object.keys(COPY_OPTIONS),
    conflictMode: 'skip',
    dryRun: false,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  copySessions.set(id, session);
  return session;
}

function makeBuildSession(interaction) {
  const id = `${interaction.user.id}-${Date.now().toString(36)}`;
  const session = {
    id,
    ownerId: interaction.user.id,
    controlGuildId: interaction.guild.id,
    templateId: null,
    destinationGuildId: interaction.options?.getString?.('destination_server') || interaction.guild.id,
    conflictMode: 'skip',
    dryRun: false,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  buildSessions.set(id, session);
  return session;
}

function getSession(map, interaction, sessionId) {
  cleanupSessions(map);
  const session = map.get(sessionId);
  if (!session || session.ownerId !== interaction.user?.id) return null;
  return session;
}

function serializeChannel(channel) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    parentId: channel.parentId || null,
    position: channel.rawPosition ?? channel.position ?? 0,
    topic: channel.topic || null,
    nsfw: Boolean(channel.nsfw),
    rateLimitPerUser: channel.rateLimitPerUser || 0,
    bitrate: channel.bitrate || null,
    userLimit: channel.userLimit || 0,
    rtcRegion: channel.rtcRegion || null,
    videoQualityMode: channel.videoQualityMode || null,
    defaultAutoArchiveDuration: channel.defaultAutoArchiveDuration || null,
    defaultThreadRateLimitPerUser: channel.defaultThreadRateLimitPerUser || 0,
    availableTags: Array.isArray(channel.availableTags) ? channel.availableTags.map((tag) => ({
      name: tag.name,
      moderated: Boolean(tag.moderated),
      emojiId: tag.emojiId || null,
      emojiName: tag.emojiName || null,
    })) : [],
    permissionOverwrites: channel.permissionOverwrites?.cache
      ? channel.permissionOverwrites.cache.map((overwrite) => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow.bitfield.toString(),
          deny: overwrite.deny.bitfield.toString(),
        }))
      : [],
  };
}

function buildSnapshot(sourceGuild, selectedOptions = Object.keys(COPY_OPTIONS)) {
  const selected = new Set(selectedOptions);
  const channels = selected.has('categories') || selected.has('channels') || selected.has('permissions')
    ? sourceGuild.channels.cache
        .filter((channel) => selected.has('channels') || channel.type === ChannelType.GuildCategory)
        .sort((a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0))
        .map(serializeChannel)
    : [];

  const roles = selected.has('roles') || selected.has('permissions')
    ? sourceGuild.roles.cache
        .filter((role) => role.id !== sourceGuild.id && !role.managed)
        .sort((a, b) => a.position - b.position)
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.color,
          hoist: role.hoist,
          mentionable: role.mentionable,
          permissions: role.permissions.bitfield.toString(),
          position: role.position,
        }))
    : [];

  const emojis = selected.has('emojis')
    ? sourceGuild.emojis.cache.map((emoji) => ({ id: emoji.id, name: emoji.name, animated: emoji.animated, url: emoji.url }))
    : [];

  const settings = selected.has('serverSettings') ? {
    name: sourceGuild.name,
    description: sourceGuild.description || null,
    verificationLevel: sourceGuild.verificationLevel,
    explicitContentFilter: sourceGuild.explicitContentFilter,
    defaultMessageNotifications: sourceGuild.defaultMessageNotifications,
    afkTimeout: sourceGuild.afkTimeout,
    iconURL: sourceGuild.iconURL({ extension: 'png', size: 1024 }) || null,
    bannerURL: sourceGuild.bannerURL({ extension: 'png', size: 2048 }) || null,
    splashURL: sourceGuild.splashURL({ extension: 'png', size: 2048 }) || null,
  } : null;

  return {
    sourceGuild: { id: sourceGuild.id, name: sourceGuild.name },
    options: [...selected],
    settings,
    roles,
    channels,
    emojis,
    stats: {
      roles: roles.length,
      categories: channels.filter((channel) => channel.type === ChannelType.GuildCategory).length,
      channels: channels.filter((channel) => channel.type !== ChannelType.GuildCategory).length,
      permissionOverwrites: channels.reduce((total, channel) => total + (channel.permissionOverwrites?.length || 0), 0),
      emojis: emojis.length,
    },
  };
}

function getTemplates(guildId) {
  return guildManager.getGuildSection(guildId, 'templates', {});
}

function saveTemplates(guildId, templates, guildOrMeta = {}) {
  return guildManager.saveGuildSection(guildId, 'templates', templates, guildOrMeta);
}

function listTemplates(guildId) {
  return Object.entries(getTemplates(guildId))
    .filter(([, template]) => template?.snapshot)
    .map(([id, template]) => ({ id, ...template }))
    .sort((a, b) => String(a.meta?.name || a.id).localeCompare(String(b.meta?.name || b.id)));
}

function templateOptions(guildId, selectedId = null) {
  const templates = listTemplates(guildId);
  if (!templates.length) return [{ label: 'No templates saved yet', description: 'Use /server export first', value: 'none' }];
  return templates.slice(0, 25).map((template) => ({
    label: String(template.meta?.name || template.id).slice(0, 100),
    description: `ID: ${template.id} | v${template.meta?.version || '1.0.0'}`.slice(0, 100),
    value: template.id,
    default: selectedId === template.id,
  }));
}

function conflictOptions(selected = 'skip') {
  return Object.entries(CONFLICT_MODES).map(([value, label]) => ({ label, value, default: selected === value }));
}

function optionOptions(selectedOptions = []) {
  const selected = new Set(selectedOptions);
  return Object.entries(COPY_OPTIONS).map(([value, label]) => ({ label, value, default: selected.has(value) }));
}

function buildCopyPayload(interaction, session) {
  return {
    embeds: [createEmbed('🛠️ Server Copy', [
      `**Source:** ${session.sourceGuildId ? getGuildById(interaction.client, session.sourceGuildId)?.name || session.sourceGuildId : '`Not selected`'}`,
      `**Destination:** ${session.destinationGuildId ? getGuildById(interaction.client, session.destinationGuildId)?.name || session.destinationGuildId : '`Not selected`'}`,
      `**Conflict mode:** \`${session.conflictMode}\``,
      `**Dry run:** \`${session.dryRun ? 'ON' : 'OFF'}\``,
      '',
      '**Selected:**',
      session.selectedOptions.map((key) => `• ${COPY_OPTIONS[key] || key}`).join('\n'),
    ].join('\n'))],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId(COPY_PREFIX, session.id, 'source')).setPlaceholder('Source server').addOptions(guildOptions(interaction.client, session.sourceGuildId))),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId(COPY_PREFIX, session.id, 'destination')).setPlaceholder('Destination server').addOptions(guildOptions(interaction.client, session.destinationGuildId))),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId(COPY_PREFIX, session.id, 'options')).setPlaceholder('What to copy').setMinValues(1).setMaxValues(Object.keys(COPY_OPTIONS).length).addOptions(optionOptions(session.selectedOptions))),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId(COPY_PREFIX, session.id, 'conflict')).setPlaceholder('Conflict mode').addOptions(conflictOptions(session.conflictMode))),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(customId(COPY_PREFIX, session.id, 'start')).setLabel(session.dryRun ? 'Run Dry-Run' : 'Start Copy').setStyle(ButtonStyle.Success).setDisabled(!session.sourceGuildId || !session.destinationGuildId || session.sourceGuildId === session.destinationGuildId),
        new ButtonBuilder().setCustomId(customId(COPY_PREFIX, session.id, 'dryrun')).setLabel(session.dryRun ? 'Dry Run: ON' : 'Dry Run: OFF').setStyle(session.dryRun ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(customId(COPY_PREFIX, session.id, 'cancel')).setLabel('Cancel').setStyle(ButtonStyle.Danger)
      ),
    ],
    flags: MessageFlags.Ephemeral,
  };
}

function buildBuildPayload(interaction, session) {
  const template = session.templateId ? getTemplates(session.controlGuildId)[session.templateId] : null;
  return {
    embeds: [createEmbed('🏗️ Server Build', [
      `**Templates available:** \`${listTemplates(session.controlGuildId).length}\``,
      `**Template:** ${template ? `**${template.meta?.name || session.templateId}** \`(${session.templateId})\`` : '`Not selected`'}`,
      `**Destination:** ${session.destinationGuildId ? getGuildById(interaction.client, session.destinationGuildId)?.name || session.destinationGuildId : '`Not selected`'}`,
      `**Conflict mode:** \`${session.conflictMode}\``,
      `**Dry run:** \`${session.dryRun ? 'ON' : 'OFF'}\``,
      template ? `\n**Snapshot:** roles \`${template.snapshot?.stats?.roles || 0}\`, channels \`${template.snapshot?.stats?.channels || 0}\`, emojis \`${template.snapshot?.stats?.emojis || 0}\`` : '\nUse `/server export` first to save templates.',
    ].join('\n'))],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId(BUILD_PREFIX, session.id, 'template')).setPlaceholder('Choose template').setDisabled(!listTemplates(session.controlGuildId).length).addOptions(templateOptions(session.controlGuildId, session.templateId))),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId(BUILD_PREFIX, session.id, 'destination')).setPlaceholder('Destination server').addOptions(guildOptions(interaction.client, session.destinationGuildId))),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId(BUILD_PREFIX, session.id, 'conflict')).setPlaceholder('Conflict mode').addOptions(conflictOptions(session.conflictMode))),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(customId(BUILD_PREFIX, session.id, 'start')).setLabel(session.dryRun ? 'Run Dry-Run' : 'Build Server').setStyle(ButtonStyle.Success).setDisabled(!session.templateId || !session.destinationGuildId),
        new ButtonBuilder().setCustomId(customId(BUILD_PREFIX, session.id, 'dryrun')).setLabel(session.dryRun ? 'Dry Run: ON' : 'Dry Run: OFF').setStyle(session.dryRun ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(customId(BUILD_PREFIX, session.id, 'cancel')).setLabel('Cancel').setStyle(ButtonStyle.Danger)
      ),
    ],
    flags: MessageFlags.Ephemeral,
  };
}

async function start(interaction) {
  const access = assertAccess(interaction);
  if (!access.allowed) return interaction.reply({ content: `❌ ${access.reason}`, flags: MessageFlags.Ephemeral });
  const session = makeCopySession(interaction);
  return interaction.reply(buildCopyPayload(interaction, session));
}

async function exportTemplate(interaction) {
  const access = assertAccess(interaction);
  if (!access.allowed) return interaction.reply({ content: `❌ ${access.reason}`, flags: MessageFlags.Ephemeral });

  const sourceGuildId = interaction.options.getString('source_server') || interaction.guild.id;
  const name = interaction.options.getString('name', true);
  const templateId = slugify(interaction.options.getString('template_id') || name);
  const version = interaction.options.getString('version') || '1.0.0';
  const description = interaction.options.getString('description') || '';

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sourceGuild = getGuildById(interaction.client, sourceGuildId);
  if (!sourceGuild) return interaction.editReply({ content: '❌ Goliath must be in the source server before it can export it.' });

  await fetchGuildState(sourceGuild);
  const snapshot = buildSnapshot(sourceGuild);
  const templates = getTemplates(interaction.guild.id);
  const existing = templates[templateId];

  templates[templateId] = {
    meta: {
      id: templateId,
      name,
      description,
      version,
      sourceGuildId: sourceGuild.id,
      sourceGuildName: sourceGuild.name,
      createdAt: existing?.meta?.createdAt || now(),
      updatedAt: now(),
      createdBy: existing?.meta?.createdBy || interaction.user.id,
      updatedBy: interaction.user.id,
      environment: String(process.env.BOT_MODE || 'DEV').toUpperCase(),
      schemaVersion: 1,
    },
    snapshot,
  };

  saveTemplates(interaction.guild.id, templates, interaction.guild);

  return interaction.editReply({ embeds: [createEmbed('✅ Server Template Exported', [
    `**Template:** ${name}`,
    `**ID:** \`${templateId}\``,
    `**Source:** ${sourceGuild.name}`,
    '',
    '**Saved into this guild JSON:**',
    `\`templates.${templateId}\``,
    '',
    `Roles \`${snapshot.stats.roles}\` • Categories \`${snapshot.stats.categories}\` • Channels \`${snapshot.stats.channels}\` • Emojis \`${snapshot.stats.emojis}\``,
  ].join('\n'), 0x22c55e)] });
}

async function startBuild(interaction) {
  const access = assertAccess(interaction);
  if (!access.allowed) return interaction.reply({ content: `❌ ${access.reason}`, flags: MessageFlags.Ephemeral });
  const session = makeBuildSession(interaction);
  return interaction.reply(buildBuildPayload(interaction, session));
}

function findExistingRole(guild, name) {
  return guild.roles.cache.find((role) => role.name.toLowerCase() === String(name).toLowerCase() && role.id !== guild.id);
}

function findExistingChannel(guild, channel) {
  return guild.channels.cache.find((existing) => existing.type === channel.type && existing.name.toLowerCase() === channel.name.toLowerCase());
}

function makeUniqueName(existingNames, baseName, maxLength = 100) {
  const cleanBase = String(baseName || 'copy').slice(0, maxLength - 8);
  let candidate = `${cleanBase}-copy`;
  let index = 2;
  while (existingNames.has(candidate.toLowerCase())) {
    candidate = `${cleanBase}-copy-${index}`.slice(0, maxLength);
    index += 1;
  }
  existingNames.add(candidate.toLowerCase());
  return candidate;
}

async function fetchBuffer(url) {
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch asset: ${response.status}`);
  return response.buffer();
}

async function clearDestination(guild, log) {
  for (const channel of [...guild.channels.cache.values()].sort((a, b) => b.position - a.position)) {
    try {
      await channel.delete('Goliath server copy/build: replace destination');
      log.deleted.channels += 1;
    } catch (error) {
      log.errors.push(`Delete channel ${channel.name}: ${error.message}`);
    }
  }

  const botHighest = guild.members.me?.roles?.highest?.position ?? 0;
  const roles = guild.roles.cache
    .filter((role) => role.id !== guild.id && !role.managed && role.editable && role.position < botHighest)
    .sort((a, b) => b.position - a.position);

  for (const role of roles.values()) {
    try {
      await role.delete('Goliath server copy/build: replace roles');
      log.deleted.roles += 1;
    } catch (error) {
      log.errors.push(`Delete role ${role.name}: ${error.message}`);
    }
  }
}

async function applySettings(guild, snapshot, log) {
  const settings = snapshot.settings;
  if (!settings) return;
  const payload = {};
  if (settings.name) payload.name = settings.name;
  if (settings.description !== undefined) payload.description = settings.description || null;
  if (Number.isFinite(settings.verificationLevel)) payload.verificationLevel = settings.verificationLevel;
  if (Number.isFinite(settings.explicitContentFilter)) payload.explicitContentFilter = settings.explicitContentFilter;
  if (Number.isFinite(settings.defaultMessageNotifications)) payload.defaultMessageNotifications = settings.defaultMessageNotifications;
  if (Number.isFinite(settings.afkTimeout)) payload.afkTimeout = settings.afkTimeout;
  try {
    if (settings.iconURL) payload.icon = await fetchBuffer(settings.iconURL);
    if (settings.bannerURL) payload.banner = await fetchBuffer(settings.bannerURL);
    if (settings.splashURL) payload.splash = await fetchBuffer(settings.splashURL);
  } catch (error) {
    log.errors.push(`Branding asset: ${error.message}`);
  }
  if (!Object.keys(payload).length) return;
  await guild.edit(payload, 'Goliath server copy/build: settings');
  log.copied.serverSettings = Object.keys(payload).length;
}

async function applyRoles(guild, snapshot, maps, log, conflictMode) {
  const existingNames = new Set(guild.roles.cache.map((role) => role.name.toLowerCase()));
  for (const role of [...(snapshot.roles || [])].sort((a, b) => a.position - b.position)) {
    const existing = findExistingRole(guild, role.name);
    if (existing && conflictMode === 'skip') {
      maps.roles.set(role.id, existing.id);
      log.skipped.push(`Role exists: ${role.name}`);
      continue;
    }
    const name = existing && conflictMode === 'rename' ? makeUniqueName(existingNames, role.name, 100) : role.name;
    const created = await guild.roles.create({ name, color: role.color, hoist: role.hoist, mentionable: role.mentionable, permissions: BigInt(role.permissions || 0), reason: 'Goliath server copy/build: role' });
    maps.roles.set(role.id, created.id);
    existingNames.add(created.name.toLowerCase());
    log.copied.roles += 1;
  }
}

function channelPayload(channel, parentId = null, name = null) {
  const payload = { name: name || channel.name, type: channel.type, reason: 'Goliath server copy/build: channel' };
  if (parentId) payload.parent = parentId;
  if ([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(channel.type)) {
    payload.topic = channel.topic || undefined;
    payload.nsfw = channel.nsfw;
    payload.rateLimitPerUser = channel.rateLimitPerUser || 0;
  }
  if ([ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) {
    payload.bitrate = channel.bitrate || undefined;
    payload.userLimit = channel.userLimit || 0;
    payload.rtcRegion = channel.rtcRegion || undefined;
    payload.videoQualityMode = channel.videoQualityMode || undefined;
  }
  if ([ChannelType.GuildForum, ChannelType.GuildMedia].includes(channel.type)) {
    payload.defaultAutoArchiveDuration = channel.defaultAutoArchiveDuration || undefined;
    payload.defaultThreadRateLimitPerUser = channel.defaultThreadRateLimitPerUser || 0;
    if (channel.availableTags?.length) payload.availableTags = channel.availableTags;
  }
  return payload;
}

async function applyChannels(guild, snapshot, maps, log, conflictMode) {
  const existingNames = new Set(guild.channels.cache.map((channel) => channel.name.toLowerCase()));
  const categories = (snapshot.channels || []).filter((channel) => channel.type === ChannelType.GuildCategory).sort((a, b) => a.position - b.position);
  const channels = (snapshot.channels || []).filter((channel) => channel.type !== ChannelType.GuildCategory).sort((a, b) => a.position - b.position);

  for (const category of categories) {
    const existing = findExistingChannel(guild, category);
    if (existing && conflictMode === 'skip') {
      maps.channels.set(category.id, existing.id);
      log.skipped.push(`Category exists: ${category.name}`);
      continue;
    }
    const name = existing && conflictMode === 'rename' ? makeUniqueName(existingNames, category.name, 100) : category.name;
    const created = await guild.channels.create(channelPayload(category, null, name));
    maps.channels.set(category.id, created.id);
    log.copied.categories += 1;
  }

  for (const channel of channels) {
    const existing = findExistingChannel(guild, channel);
    if (existing && conflictMode === 'skip') {
      maps.channels.set(channel.id, existing.id);
      log.skipped.push(`Channel exists: ${channel.name}`);
      continue;
    }
    const parentId = channel.parentId ? maps.channels.get(channel.parentId) : null;
    const name = existing && conflictMode === 'rename' ? makeUniqueName(existingNames, channel.name, 100) : channel.name;
    const created = await guild.channels.create(channelPayload(channel, parentId, name));
    maps.channels.set(channel.id, created.id);
    log.copied.channels += 1;
  }
}

async function applyPermissions(guild, snapshot, maps, log) {
  for (const sourceChannel of snapshot.channels || []) {
    const destinationChannelId = maps.channels.get(sourceChannel.id);
    if (!destinationChannelId) continue;
    const channel = guild.channels.cache.get(destinationChannelId) || await guild.channels.fetch(destinationChannelId).catch(() => null);
    if (!channel?.permissionOverwrites?.set) continue;
    const overwrites = [];
    for (const overwrite of sourceChannel.permissionOverwrites || []) {
      const mappedId = overwrite.id === snapshot.sourceGuild?.id ? guild.id : maps.roles.get(overwrite.id);
      if (!mappedId) continue;
      overwrites.push({ id: mappedId, type: overwrite.type, allow: new PermissionsBitField(BigInt(overwrite.allow || 0)), deny: new PermissionsBitField(BigInt(overwrite.deny || 0)) });
    }
    await channel.permissionOverwrites.set(overwrites, 'Goliath server copy/build: permissions');
    log.copied.permissionOverwrites += overwrites.length;
  }
}

async function applyEmojis(guild, snapshot, log, conflictMode) {
  const existingNames = new Set(guild.emojis.cache.map((emoji) => emoji.name.toLowerCase()));
  for (const emoji of snapshot.emojis || []) {
    if (!emoji.url || !emoji.name) continue;
    if (existingNames.has(emoji.name.toLowerCase()) && conflictMode === 'skip') {
      log.skipped.push(`Emoji exists: ${emoji.name}`);
      continue;
    }
    const name = existingNames.has(emoji.name.toLowerCase()) && conflictMode === 'rename'
      ? makeUniqueName(existingNames, emoji.name, 32).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32)
      : emoji.name;
    await guild.emojis.create({ attachment: emoji.url, name, reason: 'Goliath server copy/build: emoji' });
    existingNames.add(name.toLowerCase());
    log.copied.emojis += 1;
  }
}

function createRunLog(mode, session, snapshot) {
  return {
    mode,
    status: session.dryRun ? 'dry-run' : 'running',
    dryRun: Boolean(session.dryRun),
    conflictMode: session.conflictMode,
    rollbackBackupId: null,
    snapshotStats: snapshot.stats,
    copied: { serverSettings: 0, roles: 0, categories: 0, channels: 0, permissionOverwrites: 0, emojis: 0 },
    deleted: { roles: 0, channels: 0 },
    skipped: [],
    errors: [],
  };
}

function completeEmbed(title, guild, log) {
  return createEmbed(title, [
    `**Destination:** ${guild.name}`,
    `**Status:** \`${log.status}\``,
    `**Conflict mode:** \`${log.conflictMode}\``,
    `**Rollback:** \`${log.rollbackBackupId || (log.dryRun ? 'dry-run' : 'none')}\``,
    '',
    `Settings \`${log.copied.serverSettings}\` • Roles \`${log.copied.roles}\` • Categories \`${log.copied.categories}\` • Channels \`${log.copied.channels}\` • Permissions \`${log.copied.permissionOverwrites}\` • Emojis \`${log.copied.emojis}\``,
    log.deleted.roles || log.deleted.channels ? `\nDeleted: roles \`${log.deleted.roles}\`, channels \`${log.deleted.channels}\`` : '',
    log.skipped.length ? `\nSkipped:\n${log.skipped.slice(0, 8).map((item) => `• ${item}`).join('\n')}` : '',
    log.errors.length ? `\nWarnings/Errors:\n${log.errors.slice(0, 8).map((error) => `⚠️ ${error}`).join('\n')}` : '',
  ].filter(Boolean).join('\n'), log.errors.length ? 0xf59e0b : 0x22c55e);
}

async function executeSnapshot(interaction, session, snapshot, title) {
  const guild = getGuildById(interaction.client, session.destinationGuildId);
  if (!guild) throw new Error('Destination server is not available to Goliath.');
  await fetchGuildState(guild);
  const log = createRunLog(title, session, snapshot);

  if (session.dryRun) {
    log.status = 'dry-run';
    return interaction.editReply({ embeds: [completeEmbed(`🧪 ${title} Dry-Run Complete`, guild, log)], components: [] });
  }

  try {
    const rollback = await createServerBackup(guild, { createdBy: `${title}:${interaction.user.id}`, requestedBy: interaction.user.id, reason: `Rollback before ${title}`, type: 'rollback' });
    log.rollbackBackupId = rollback.backupId;

    if (session.conflictMode === 'replace') {
      await clearDestination(guild, log);
      await fetchGuildState(guild);
    }

    const maps = { roles: new Map([[snapshot.sourceGuild?.id, guild.id]]), channels: new Map() };
    await applySettings(guild, snapshot, log);
    await applyRoles(guild, snapshot, maps, log, session.conflictMode);
    await applyChannels(guild, snapshot, maps, log, session.conflictMode);
    await applyPermissions(guild, snapshot, maps, log);
    await applyEmojis(guild, snapshot, log, session.conflictMode);

    log.status = log.errors.length ? 'completed-with-warnings' : 'success';
  } catch (error) {
    log.status = 'failed';
    log.errors.push(error.message);
  }

  return interaction.editReply({ embeds: [completeEmbed(`✅ ${title} Complete`, guild, log)], components: [] });
}

async function analyse(interaction) {
  const access = assertAccess(interaction);
  if (!access.allowed) return interaction.reply({ content: `❌ ${access.reason}`, flags: MessageFlags.Ephemeral });

  const sourceGuild = getGuildById(interaction.client, interaction.options.getString('source_server', true));
  const destinationGuild = getGuildById(interaction.client, interaction.options.getString('destination_server', true));
  if (!sourceGuild || !destinationGuild) return interaction.reply({ content: '❌ Goliath must be in both source and destination servers.', flags: MessageFlags.Ephemeral });

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await fetchGuildState(sourceGuild);
  await fetchGuildState(destinationGuild);

  const snapshot = buildSnapshot(sourceGuild);
  const destRoles = new Set(destinationGuild.roles.cache.map((role) => role.name.toLowerCase()));
  const destChannels = new Set(destinationGuild.channels.cache.map((channel) => `${channel.type}:${channel.name.toLowerCase()}`));
  const destEmojis = new Set(destinationGuild.emojis.cache.map((emoji) => emoji.name.toLowerCase()));
  const missingRoles = snapshot.roles.filter((role) => !destRoles.has(role.name.toLowerCase())).length;
  const missingChannels = snapshot.channels.filter((channel) => !destChannels.has(`${channel.type}:${channel.name.toLowerCase()}`)).length;
  const missingEmojis = snapshot.emojis.filter((emoji) => !destEmojis.has(emoji.name.toLowerCase())).length;
  const permissionLines = REQUIRED_BOT_PERMISSIONS.map(([name, bit]) => `${destinationGuild.members.me?.permissions?.has(bit) ? '✅' : '❌'} ${name}`).join('\n');

  return interaction.editReply({ embeds: [createEmbed('🔎 Server Analyse', [
    `**Source:** ${sourceGuild.name}`,
    `**Destination:** ${destinationGuild.name}`,
    '',
    `Missing roles: \`${missingRoles}\``,
    `Missing channels: \`${missingChannels}\``,
    `Missing emojis: \`${missingEmojis}\``,
    '',
    '**Bot permissions:**',
    permissionLines,
  ].join('\n'), 0x22c55e)] });
}

async function handleCopyInteraction(interaction, parsed) {
  const session = getSession(copySessions, interaction, parsed.sessionId);
  if (!session) return interaction.reply({ content: '❌ Server copy session expired or you do not own it.', flags: MessageFlags.Ephemeral }).catch(() => null);
  const access = assertAccess(interaction);
  if (!access.allowed) return interaction.reply({ content: `❌ ${access.reason}`, flags: MessageFlags.Ephemeral }).catch(() => null);

  if (parsed.action === 'source') session.sourceGuildId = interaction.values?.[0] || null;
  else if (parsed.action === 'destination') session.destinationGuildId = interaction.values?.[0] || null;
  else if (parsed.action === 'options') session.selectedOptions = interaction.values || Object.keys(COPY_OPTIONS);
  else if (parsed.action === 'conflict') session.conflictMode = interaction.values?.[0] || 'skip';
  else if (parsed.action === 'dryrun') session.dryRun = !session.dryRun;
  else if (parsed.action === 'cancel') {
    copySessions.delete(session.id);
    return interaction.update({ embeds: [createEmbed('❌ Server Copy Cancelled', 'No changes were made.', 0xef4444)], components: [] });
  } else if (parsed.action === 'start') {
    const sourceGuild = getGuildById(interaction.client, session.sourceGuildId);
    if (!sourceGuild) return interaction.update({ content: '❌ Source server is unavailable.', embeds: [], components: [] });
    await fetchGuildState(sourceGuild);
    const snapshot = buildSnapshot(sourceGuild, session.selectedOptions);
    await interaction.update({ embeds: [createEmbed('🚧 Server Copy Running', 'Working...', 0x5865f2)], components: [] });
    await executeSnapshot(interaction, session, snapshot, 'Server Copy');
    copySessions.delete(session.id);
    return true;
  }

  return interaction.update(buildCopyPayload(interaction, session));
}

async function handleBuildInteraction(interaction, parsed) {
  const session = getSession(buildSessions, interaction, parsed.sessionId);
  if (!session) return interaction.reply({ content: '❌ Server build session expired or you do not own it.', flags: MessageFlags.Ephemeral }).catch(() => null);
  const access = assertAccess(interaction);
  if (!access.allowed) return interaction.reply({ content: `❌ ${access.reason}`, flags: MessageFlags.Ephemeral }).catch(() => null);

  if (parsed.action === 'template') session.templateId = interaction.values?.[0] === 'none' ? null : interaction.values?.[0];
  else if (parsed.action === 'destination') session.destinationGuildId = interaction.values?.[0] || null;
  else if (parsed.action === 'conflict') session.conflictMode = interaction.values?.[0] || 'skip';
  else if (parsed.action === 'dryrun') session.dryRun = !session.dryRun;
  else if (parsed.action === 'cancel') {
    buildSessions.delete(session.id);
    return interaction.update({ embeds: [createEmbed('❌ Server Build Cancelled', 'No changes were made.', 0xef4444)], components: [] });
  } else if (parsed.action === 'start') {
    const template = getTemplates(session.controlGuildId)[session.templateId];
    if (!template?.snapshot) return interaction.update({ content: '❌ Template not found.', embeds: [], components: [] });
    await interaction.update({ embeds: [createEmbed('🏗️ Server Build Running', 'Working...', 0x5865f2)], components: [] });
    await executeSnapshot(interaction, session, template.snapshot, 'Server Build');
    buildSessions.delete(session.id);
    return true;
  }

  return interaction.update(buildBuildPayload(interaction, session));
}

async function handleInteraction(interaction) {
  if (!interaction?.customId) return false;
  const copyParsed = parseCustomId(interaction.customId, COPY_PREFIX);
  if (copyParsed) {
    await handleCopyInteraction(interaction, copyParsed);
    return true;
  }
  const buildParsed = parseCustomId(interaction.customId, BUILD_PREFIX);
  if (buildParsed) {
    await handleBuildInteraction(interaction, buildParsed);
    return true;
  }
  return false;
}

module.exports = {
  COPY_OPTIONS,
  CONFLICT_MODES,
  assertAccess,
  start,
  analyse,
  exportTemplate,
  startBuild,
  handleInteraction,
  buildSnapshot,
  getTemplates,
  listTemplates,
};
