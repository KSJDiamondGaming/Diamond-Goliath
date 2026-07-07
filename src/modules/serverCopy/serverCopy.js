'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
  StringSelectMenuBuilder,
} = require('discord.js');

const security = require('../../core/security/securityCore');
const guildManager = require('../../core/guild/guildManager');
const { createServerBackup } = require('../../core/security/serverBackup');

const CUSTOM_PREFIX = 'server-copy';
const SESSION_TTL_MS = 20 * 60 * 1000;
const sessions = new Map();

const COPY_OPTIONS = Object.freeze({
  everything: {
    label: 'Everything Discord Allows',
    description: 'Recommended. Select every available copy option.',
    emoji: '💾',
    recommended: true,
  },
  roles: {
    label: 'Roles',
    description: 'Copy non-managed roles and permissions.',
    emoji: '🎭',
    implemented: true,
  },
  categories: {
    label: 'Categories',
    description: 'Copy category channels and ordering.',
    emoji: '📁',
    implemented: true,
  },
  channels: {
    label: 'Channels',
    description: 'Copy text, announcement, voice, stage and forum channels.',
    emoji: '💬',
    implemented: true,
  },
  permissions: {
    label: 'Channel Permissions',
    description: 'Copy permission overwrites after roles/channels are mapped.',
    emoji: '🔐',
    implemented: true,
  },
  serverSettings: {
    label: 'Server Settings',
    description: 'Copy basic editable server settings where Discord allows.',
    emoji: '⚙️',
    implemented: true,
  },
  emojis: {
    label: 'Emojis',
    description: 'Copy custom static/animated emojis where limits allow.',
    emoji: '😀',
    implemented: true,
  },
  stickers: {
    label: 'Stickers',
    description: 'Planned. Discord API support varies by guild.',
    emoji: '🏷️',
    implemented: false,
  },
  automod: {
    label: 'AutoMod Rules',
    description: 'Planned. Rules require careful trigger/action mapping.',
    emoji: '🛡️',
    implemented: false,
  },
  welcomeScreen: {
    label: 'Welcome Screen',
    description: 'Planned. Requires community feature support.',
    emoji: '👋',
    implemented: false,
  },
  scheduledEvents: {
    label: 'Scheduled Events',
    description: 'Planned. Events need new destination metadata.',
    emoji: '📅',
    implemented: false,
  },
  webhooks: {
    label: 'Webhooks',
    description: 'Optional/planned. Webhook tokens cannot be cloned.',
    emoji: '🪝',
    implemented: false,
  },
});

const IMPLEMENTED_OPTIONS = Object.entries(COPY_OPTIONS)
  .filter(([key, option]) => key !== 'everything' && option.implemented)
  .map(([key]) => key);

const CANNOT_COPY = [
  'Members',
  'Messages',
  'Boosts',
  'Invites',
  'Audit logs',
  'Ownership',
  'Installed bots',
  'Server boost status',
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

function getAllowedOwnerIds() {
  return [...new Set([
    ...splitIds(process.env.SERVER_COPY_OWNER_IDS),
    ...splitIds(process.env.OWNER_ID),
    ...splitIds(process.env.OWNER_IDS),
    ...splitIds(process.env.BOT_OWNER_ID),
    ...splitIds(process.env.BOT_OWNER_IDS),
    ...security.getBotOwnerIds?.() || [],
  ].filter(Boolean))];
}

function isOwnerAllowed(userId) {
  return getAllowedOwnerIds().includes(String(userId || ''));
}

function getAllowedGuildIdsFromEnv() {
  return [...new Set([
    ...splitIds(process.env.SERVER_COPY_GUILD_IDS),
    ...splitIds(process.env.SERVER_COPY_ALLOWED_GUILD_IDS),
  ])];
}

function getModuleConfig(guildId) {
  try {
    return guildManager.getGuildSection(guildId, 'modules', {})?.serverCopy || {};
  } catch {
    return {};
  }
}

function isModuleEnabled(guildId) {
  const config = getModuleConfig(guildId);
  return config.enabled !== false;
}

function assertAccess(interaction) {
  if (!interaction?.guild) {
    return { allowed: false, reason: 'This command can only be used inside a server.' };
  }

  if (!isOwnerAllowed(interaction.user?.id)) {
    return { allowed: false, reason: 'This command is restricted to the bot owner.' };
  }

  if (!isModuleEnabled(interaction.guild.id)) {
    return { allowed: false, reason: 'Server Copy is disabled for this guild.' };
  }

  const allowedGuildIds = getAllowedGuildIdsFromEnv();
  if (allowedGuildIds.length && !allowedGuildIds.includes(interaction.guild.id)) {
    return { allowed: false, reason: 'Server Copy is not allowed in this server.' };
  }

  return { allowed: true };
}

function makeSession(interaction) {
  const sessionId = `${interaction.user.id}-${Date.now().toString(36)}`;
  const session = {
    id: sessionId,
    ownerId: interaction.user.id,
    createdAt: now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    controlGuildId: interaction.guild.id,
    sourceGuildId: null,
    destinationGuildId: null,
    selectedOptions: ['everything', ...IMPLEMENTED_OPTIONS],
    lastSummary: null,
  };

  sessions.set(sessionId, session);
  cleanupSessions();
  return session;
}

function getSession(interaction, sessionId) {
  cleanupSessions();
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.ownerId !== interaction.user?.id) return null;
  return session;
}

function cleanupSessions() {
  const current = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (!session || session.expiresAt <= current) sessions.delete(id);
  }
}

function customId(sessionId, action) {
  return `${CUSTOM_PREFIX}:${sessionId}:${action}`;
}

function parseCustomId(value) {
  const parts = String(value || '').split(':');
  if (parts[0] !== CUSTOM_PREFIX || !parts[1] || !parts[2]) return null;
  return { sessionId: parts[1], action: parts.slice(2).join(':') };
}

function createEmbed(title, description, color = 0x5865f2) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp(new Date());
}

function getClientGuildOptions(client, selectedId = null) {
  return [...(client.guilds?.cache?.values?.() || [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25)
    .map((guild) => ({
      label: guild.name.slice(0, 100),
      description: guild.id,
      value: guild.id,
      default: guild.id === selectedId,
    }));
}

function buildSetupPayload(interaction, session) {
  const sourceOptions = getClientGuildOptions(interaction.client, session.sourceGuildId);
  const destinationOptions = getClientGuildOptions(interaction.client, session.destinationGuildId);
  const selectedLabels = getResolvedOptionKeys(session.selectedOptions)
    .map((key) => COPY_OPTIONS[key]?.label)
    .filter(Boolean);

  const embed = createEmbed(
    '🛠️ Hidden Server Copy Setup',
    [
      '**Owner-only internal tool.**',
      'Choose the source server, destination server, and what Goliath should copy.',
      '',
      `**Source:** ${formatGuild(interaction.client, session.sourceGuildId)}`,
      `**Destination:** ${formatGuild(interaction.client, session.destinationGuildId)}`,
      '',
      '**Selected copy options:**',
      selectedLabels.length ? selectedLabels.map((label) => `• ${label}`).join('\n') : 'None selected',
      '',
      '⚠️ Destination server will be modified after confirmation.',
    ].join('\n')
  );

  const rows = [];

  rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId(session.id, 'source'))
      .setPlaceholder('Select source server')
      .addOptions(sourceOptions.length ? sourceOptions : [{ label: 'No guilds available', value: 'none' }])
      .setDisabled(!sourceOptions.length)
  ));

  rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId(session.id, 'destination'))
      .setPlaceholder('Select destination server')
      .addOptions(destinationOptions.length ? destinationOptions : [{ label: 'No guilds available', value: 'none' }])
      .setDisabled(!destinationOptions.length)
  ));

  rows.push(new ActionRowBuilder().addComponents(buildOptionsMenu(session)));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId(session.id, 'preview'))
      .setLabel('Preview Copy')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!session.sourceGuildId || !session.destinationGuildId || session.sourceGuildId === session.destinationGuildId),
    new ButtonBuilder()
      .setCustomId(customId(session.id, 'cancel'))
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  ));

  return { embeds: [embed], components: rows, flags: MessageFlags.Ephemeral };
}

function buildOptionsMenu(session) {
  const selected = new Set(session.selectedOptions || []);
  return new StringSelectMenuBuilder()
    .setCustomId(customId(session.id, 'options'))
    .setPlaceholder('Select what to copy')
    .setMinValues(1)
    .setMaxValues(Object.keys(COPY_OPTIONS).length)
    .addOptions(Object.entries(COPY_OPTIONS).map(([key, option]) => ({
      label: option.label.slice(0, 100),
      description: option.description.slice(0, 100),
      value: key,
      emoji: option.emoji,
      default: selected.has(key),
    })));
}

function formatGuild(client, guildId) {
  if (!guildId) return '`Not selected`';
  const guild = client.guilds?.cache?.get?.(guildId);
  return guild ? `**${guild.name}** \`(${guild.id})\`` : `\`${guildId}\``;
}

function getResolvedOptionKeys(selectedOptions = []) {
  const selected = new Set(selectedOptions);
  if (selected.has('everything')) return [...IMPLEMENTED_OPTIONS];
  return [...selected].filter((key) => COPY_OPTIONS[key]?.implemented);
}

function getPlannedOptionKeys(selectedOptions = []) {
  return [...new Set(selectedOptions.filter((key) => key !== 'everything' && COPY_OPTIONS[key] && !COPY_OPTIONS[key].implemented))];
}

async function fetchGuildState(guild) {
  await guild.roles.fetch().catch(() => null);
  await guild.channels.fetch().catch(() => null);
  await guild.emojis.fetch().catch(() => null);
}

function buildSnapshot(sourceGuild, selectedOptions = []) {
  const options = getResolvedOptionKeys(selectedOptions);
  const include = (key) => options.includes(key);

  const roles = include('roles')
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

  const channels = (include('categories') || include('channels'))
    ? sourceGuild.channels.cache
        .filter((channel) => include('categories') || channel.type !== ChannelType.GuildCategory)
        .filter((channel) => include('channels') || channel.type === ChannelType.GuildCategory)
        .sort((a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0))
        .map(serializeChannel)
    : [];

  const emojis = include('emojis')
    ? sourceGuild.emojis.cache.map((emoji) => ({
        id: emoji.id,
        name: emoji.name,
        animated: emoji.animated,
        url: emoji.url,
      }))
    : [];

  return {
    sourceGuild: {
      id: sourceGuild.id,
      name: sourceGuild.name,
      iconURL: sourceGuild.iconURL({ extension: 'png', size: 1024 }) || null,
    },
    options,
    planned: getPlannedOptionKeys(selectedOptions),
    roles,
    channels,
    emojis,
    settings: include('serverSettings') ? serializeGuildSettings(sourceGuild) : null,
    stats: {
      roles: roles.length,
      categories: channels.filter((channel) => channel.type === ChannelType.GuildCategory).length,
      channels: channels.filter((channel) => channel.type !== ChannelType.GuildCategory).length,
      permissionOverwrites: channels.reduce((total, channel) => total + channel.permissionOverwrites.length, 0),
      emojis: emojis.length,
    },
  };
}

function serializeGuildSettings(guild) {
  return {
    name: guild.name,
    verificationLevel: guild.verificationLevel,
    explicitContentFilter: guild.explicitContentFilter,
    defaultMessageNotifications: guild.defaultMessageNotifications,
    afkTimeout: guild.afkTimeout,
  };
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
    defaultReactionEmoji: channel.defaultReactionEmoji || null,
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

async function buildPreview(interaction, session) {
  const sourceGuild = interaction.client.guilds.cache.get(session.sourceGuildId);
  const destinationGuild = interaction.client.guilds.cache.get(session.destinationGuildId);

  if (!sourceGuild || !destinationGuild) {
    throw new Error('Source or destination server is not available to the bot.');
  }

  await fetchGuildState(sourceGuild);
  const snapshot = buildSnapshot(sourceGuild, session.selectedOptions);
  session.lastSummary = snapshot.stats;

  const implementedLabels = snapshot.options.map((key) => COPY_OPTIONS[key]?.label).filter(Boolean);
  const plannedLabels = snapshot.planned.map((key) => COPY_OPTIONS[key]?.label).filter(Boolean);

  const embed = createEmbed(
    '📋 Server Copy Preview',
    [
      `**Source:** ${sourceGuild.name} \`(${sourceGuild.id})\``,
      `**Destination:** ${destinationGuild.name} \`(${destinationGuild.id})\``,
      '',
      '**Will copy now:**',
      implementedLabels.length ? implementedLabels.map((label) => `✅ ${label}`).join('\n') : 'None',
      plannedLabels.length ? `\n**Selected but planned for later:**\n${plannedLabels.map((label) => `🟡 ${label}`).join('\n')}` : '',
      '',
      '**Snapshot counts:**',
      `• Roles: \`${snapshot.stats.roles}\``,
      `• Categories: \`${snapshot.stats.categories}\``,
      `• Channels: \`${snapshot.stats.channels}\``,
      `• Permission overwrites: \`${snapshot.stats.permissionOverwrites}\``,
      `• Emojis: \`${snapshot.stats.emojis}\``,
      '',
      '**Cannot copy:**',
      CANNOT_COPY.map((item) => `❌ ${item}`).join('\n'),
      '',
      '⚠️ A rollback backup of the destination will be created before changes start.',
    ].filter(Boolean).join('\n'),
    0xf59e0b
  );

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId(session.id, 'start'))
        .setLabel('Start Copy')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(customId(session.id, 'back'))
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(customId(session.id, 'cancel'))
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
    ),
  ];

  return { embeds: [embed], components: rows, flags: MessageFlags.Ephemeral };
}

async function executeCopy(interaction, session) {
  const sourceGuild = interaction.client.guilds.cache.get(session.sourceGuildId);
  const destinationGuild = interaction.client.guilds.cache.get(session.destinationGuildId);

  if (!sourceGuild || !destinationGuild) {
    throw new Error('Source or destination server is not available to the bot.');
  }

  if (sourceGuild.id === destinationGuild.id) {
    throw new Error('Source and destination cannot be the same server.');
  }

  await fetchGuildState(sourceGuild);
  await fetchGuildState(destinationGuild);

  const snapshot = buildSnapshot(sourceGuild, session.selectedOptions);
  const log = createRunLog(interaction, sourceGuild, destinationGuild, snapshot);

  await interaction.update({
    embeds: [createEmbed('🚧 Server Copy In Progress', 'Creating rollback backup of the destination server...', 0x5865f2)],
    components: [],
  });

  const rollback = await createServerBackup(destinationGuild, {
    createdBy: `server-copy:${interaction.user.id}`,
    requestedBy: interaction.user.id,
    reason: `Rollback snapshot before copying ${sourceGuild.name} into ${destinationGuild.name}`,
    type: 'rollback',
  });

  log.rollbackBackupId = rollback.backupId;

  const maps = {
    roles: new Map([[sourceGuild.id, destinationGuild.id]]),
    channels: new Map(),
  };

  if (snapshot.options.includes('serverSettings')) {
    await copyServerSettings(destinationGuild, snapshot, log);
  }

  if (snapshot.options.includes('roles')) {
    await copyRoles(destinationGuild, snapshot, maps, log);
  }

  if (snapshot.options.includes('categories') || snapshot.options.includes('channels')) {
    await copyChannels(destinationGuild, snapshot, maps, log);
  }

  if (snapshot.options.includes('permissions')) {
    await copyPermissionOverwrites(destinationGuild, snapshot, maps, log);
  }

  if (snapshot.options.includes('emojis')) {
    await copyEmojis(destinationGuild, snapshot, log);
  }

  log.finishedAt = now();
  log.status = 'success';
  log.durationMs = new Date(log.finishedAt).getTime() - new Date(log.startedAt).getTime();

  logServerCopy(log);

  sessions.delete(session.id);

  return interaction.editReply({
    embeds: [buildCompleteEmbed(sourceGuild, destinationGuild, log)],
    components: [],
  });
}

function createRunLog(interaction, sourceGuild, destinationGuild, snapshot) {
  return {
    feature: 'serverCopy',
    status: 'running',
    startedAt: now(),
    finishedAt: null,
    durationMs: null,
    developerId: interaction.user.id,
    controlGuildId: interaction.guild.id,
    sourceGuild: { id: sourceGuild.id, name: sourceGuild.name },
    destinationGuild: { id: destinationGuild.id, name: destinationGuild.name },
    selectedOptions: snapshot.options,
    plannedOptions: snapshot.planned,
    snapshotStats: snapshot.stats,
    rollbackBackupId: null,
    copied: {
      serverSettings: 0,
      roles: 0,
      categories: 0,
      channels: 0,
      permissionOverwrites: 0,
      emojis: 0,
    },
    skipped: [],
    errors: [],
  };
}

async function copyServerSettings(destinationGuild, snapshot, log) {
  const settings = snapshot.settings;
  if (!settings) return;

  const payload = {};

  if (settings.name && destinationGuild.name !== settings.name) payload.name = settings.name;
  if (Number.isFinite(settings.verificationLevel)) payload.verificationLevel = settings.verificationLevel;
  if (Number.isFinite(settings.explicitContentFilter)) payload.explicitContentFilter = settings.explicitContentFilter;
  if (Number.isFinite(settings.defaultMessageNotifications)) {
    payload.defaultMessageNotifications = settings.defaultMessageNotifications;
  }
  if (Number.isFinite(settings.afkTimeout)) payload.afkTimeout = settings.afkTimeout;

  if (!Object.keys(payload).length) return;

  try {
    await destinationGuild.edit(payload, 'Goliath hidden server copy: server settings');
    log.copied.serverSettings = Object.keys(payload).length;
  } catch (error) {
    log.errors.push(`Server settings: ${error.message}`);
  }
}

async function copyRoles(destinationGuild, snapshot, maps, log) {
  const roles = [...snapshot.roles].sort((a, b) => a.position - b.position);

  for (const role of roles) {
    try {
      const created = await destinationGuild.roles.create({
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: BigInt(role.permissions || 0),
        reason: 'Goliath hidden server copy: role copy',
      });

      maps.roles.set(role.id, created.id);
      log.copied.roles += 1;
    } catch (error) {
      log.errors.push(`Role ${role.name}: ${error.message}`);
    }
  }
}

function channelCreatePayload(channel, parentId = null) {
  const base = {
    name: channel.name,
    type: channel.type,
    reason: 'Goliath hidden server copy: channel copy',
  };

  if (parentId) base.parent = parentId;

  if ([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(channel.type)) {
    base.topic = channel.topic || undefined;
    base.nsfw = channel.nsfw;
    base.rateLimitPerUser = channel.rateLimitPerUser || 0;
  }

  if ([ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) {
    base.bitrate = channel.bitrate || undefined;
    base.userLimit = channel.userLimit || 0;
    base.rtcRegion = channel.rtcRegion || undefined;
    base.videoQualityMode = channel.videoQualityMode || undefined;
  }

  if ([ChannelType.GuildForum, ChannelType.GuildMedia].includes(channel.type)) {
    base.defaultAutoArchiveDuration = channel.defaultAutoArchiveDuration || undefined;
    base.defaultThreadRateLimitPerUser = channel.defaultThreadRateLimitPerUser || 0;
    if (channel.availableTags?.length) base.availableTags = channel.availableTags;
  }

  return base;
}

async function copyChannels(destinationGuild, snapshot, maps, log) {
  const categories = snapshot.channels
    .filter((channel) => channel.type === ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position);

  const normalChannels = snapshot.channels
    .filter((channel) => channel.type !== ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position);

  for (const category of categories) {
    try {
      const created = await destinationGuild.channels.create(channelCreatePayload(category));
      maps.channels.set(category.id, created.id);
      log.copied.categories += 1;
    } catch (error) {
      log.errors.push(`Category ${category.name}: ${error.message}`);
    }
  }

  for (const channel of normalChannels) {
    try {
      const parentId = channel.parentId ? maps.channels.get(channel.parentId) : null;
      const created = await destinationGuild.channels.create(channelCreatePayload(channel, parentId));
      maps.channels.set(channel.id, created.id);
      log.copied.channels += 1;
    } catch (error) {
      log.errors.push(`Channel ${channel.name}: ${error.message}`);
    }
  }
}

async function copyPermissionOverwrites(destinationGuild, snapshot, maps, log) {
  for (const sourceChannel of snapshot.channels) {
    const destinationChannelId = maps.channels.get(sourceChannel.id);
    if (!destinationChannelId) continue;

    const destinationChannel = destinationGuild.channels.cache.get(destinationChannelId)
      || await destinationGuild.channels.fetch(destinationChannelId).catch(() => null);

    if (!destinationChannel?.permissionOverwrites?.set) continue;

    const overwrites = [];

    for (const overwrite of sourceChannel.permissionOverwrites || []) {
      const mappedId = overwrite.id === snapshot.sourceGuild.id
        ? destinationGuild.id
        : maps.roles.get(overwrite.id);

      if (!mappedId) continue;

      overwrites.push({
        id: mappedId,
        type: overwrite.type,
        allow: new PermissionsBitField(BigInt(overwrite.allow || 0)),
        deny: new PermissionsBitField(BigInt(overwrite.deny || 0)),
      });
    }

    try {
      await destinationChannel.permissionOverwrites.set(overwrites, 'Goliath hidden server copy: permission overwrites');
      log.copied.permissionOverwrites += overwrites.length;
    } catch (error) {
      log.errors.push(`Permissions ${sourceChannel.name}: ${error.message}`);
    }
  }
}

async function copyEmojis(destinationGuild, snapshot, log) {
  for (const emoji of snapshot.emojis) {
    if (!emoji.url || !emoji.name) continue;

    try {
      await destinationGuild.emojis.create({
        attachment: emoji.url,
        name: emoji.name,
        reason: 'Goliath hidden server copy: emoji copy',
      });
      log.copied.emojis += 1;
    } catch (error) {
      log.errors.push(`Emoji ${emoji.name}: ${error.message}`);
    }
  }
}

function buildCompleteEmbed(sourceGuild, destinationGuild, log) {
  const seconds = Math.round((log.durationMs || 0) / 1000);

  return createEmbed(
    '✅ Server Copy Complete',
    [
      `**Source:** ${sourceGuild.name}`,
      `**Destination:** ${destinationGuild.name}`,
      `**Rollback backup:** \`${log.rollbackBackupId || 'not created'}\``,
      `**Duration:** \`${seconds}s\``,
      '',
      '**Copied:**',
      `• Server settings: \`${log.copied.serverSettings}\``,
      `• Roles: \`${log.copied.roles}\``,
      `• Categories: \`${log.copied.categories}\``,
      `• Channels: \`${log.copied.channels}\``,
      `• Permission overwrites: \`${log.copied.permissionOverwrites}\``,
      `• Emojis: \`${log.copied.emojis}\``,
      log.plannedOptions.length ? `\n**Selected but not implemented yet:**\n${log.plannedOptions.map((key) => `🟡 ${COPY_OPTIONS[key]?.label || key}`).join('\n')}` : '',
      log.errors.length ? `\n**Warnings/Errors:**\n${log.errors.slice(0, 8).map((error) => `⚠️ ${error}`).join('\n')}` : '',
    ].filter(Boolean).join('\n'),
    log.errors.length ? 0xf59e0b : 0x22c55e
  );
}

function logServerCopy(log) {
  try {
    console.log('[ServerCopy]', JSON.stringify(log, null, 2));
  } catch (error) {
    console.warn('[ServerCopy] Failed to write log:', error.message);
  }
}

async function start(interaction) {
  const access = assertAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ content: `❌ ${access.reason}`, flags: MessageFlags.Ephemeral });
  }

  const session = makeSession(interaction);
  return interaction.reply(buildSetupPayload(interaction, session));
}

async function handleInteraction(interaction) {
  if (!interaction?.customId) return false;

  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return false;

  const session = getSession(interaction, parsed.sessionId);
  if (!session) {
    await interaction.reply({ content: '❌ Server copy session expired or you do not own it.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  const access = assertAccess(interaction);
  if (!access.allowed) {
    await interaction.reply({ content: `❌ ${access.reason}`, flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  try {
    if (parsed.action === 'source' && interaction.isStringSelectMenu?.()) {
      session.sourceGuildId = interaction.values?.[0] || null;
      return interaction.update(buildSetupPayload(interaction, session));
    }

    if (parsed.action === 'destination' && interaction.isStringSelectMenu?.()) {
      session.destinationGuildId = interaction.values?.[0] || null;
      return interaction.update(buildSetupPayload(interaction, session));
    }

    if (parsed.action === 'options' && interaction.isStringSelectMenu?.()) {
      const values = interaction.values || [];
      session.selectedOptions = values.includes('everything')
        ? ['everything', ...IMPLEMENTED_OPTIONS, ...values.filter((value) => !IMPLEMENTED_OPTIONS.includes(value) && value !== 'everything')]
        : values;
      return interaction.update(buildSetupPayload(interaction, session));
    }

    if (parsed.action === 'preview') {
      const previewPayload = await buildPreview(interaction, session);
      return interaction.update(previewPayload);
    }

    if (parsed.action === 'back') {
      return interaction.update(buildSetupPayload(interaction, session));
    }

    if (parsed.action === 'cancel') {
      sessions.delete(session.id);
      return interaction.update({
        embeds: [createEmbed('❌ Server Copy Cancelled', 'No changes were made.', 0xef4444)],
        components: [],
      });
    }

    if (parsed.action === 'start') {
      return executeCopy(interaction, session);
    }
  } catch (error) {
    console.error('[ServerCopy] Interaction failed:', error);

    const payload = {
      content: `❌ Server copy failed: ${error.message}`,
      embeds: [],
      components: [],
      flags: MessageFlags.Ephemeral,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }

  return true;
}

module.exports = {
  COPY_OPTIONS,
  CANNOT_COPY,
  assertAccess,
  start,
  handleInteraction,
  buildSnapshot,
  executeCopy,
};
