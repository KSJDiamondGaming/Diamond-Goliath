'use strict';

const { Events, MessageFlags, SlashCommandBuilder } = require('discord.js');
const audit = require('./auditIntelligence');
const auditRouter = require('./auditRouter');
const auditStore = require('./auditStore');
const security = require('../../core/security/securityCore');
const { snapshotMember, buildReport } = require('./userIntelligence');
const { buildUserIntelligenceSectionEmbed, buildCommandCenterSetup } = require('./auditEmbeds');

const wired = new WeakSet();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const roleState = (role) => role ? { id: role.id, name: role.name, color: role.hexColor, position: role.position, hoist: role.hoist, mentionable: role.mentionable, permissions: role.permissions?.bitfield?.toString?.() || null } : null;
const channelState = (channel) => channel ? {
  id: channel.id,
  name: channel.name,
  type: channel.type,
  parentId: channel.parentId || null,
  position: channel.rawPosition ?? channel.position ?? null,
  topic: channel.topic || null,
  nsfw: channel.nsfw || false,
  rateLimitPerUser: channel.rateLimitPerUser ?? null,
  bitrate: channel.bitrate ?? null,
  userLimit: channel.userLimit ?? null,
  permissionOverwrites: channel.permissionOverwrites?.cache
    ? channel.permissionOverwrites.cache.map((overwrite) => ({ id: overwrite.id, type: overwrite.type, allow: overwrite.allow.bitfield.toString(), deny: overwrite.deny.bitfield.toString() }))
    : [],
} : null;
const guildState = (guild) => guild ? { id: guild.id, name: guild.name, ownerId: guild.ownerId, verificationLevel: guild.verificationLevel, explicitContentFilter: guild.explicitContentFilter, preferredLocale: guild.preferredLocale, afkChannelId: guild.afkChannelId || null, systemChannelId: guild.systemChannelId || null, rulesChannelId: guild.rulesChannelId || null, publicUpdatesChannelId: guild.publicUpdatesChannelId || null } : null;
const messageState = (message) => message ? { id: message.id, content: message.content || null, authorId: message.author?.id || null, authorTag: message.author?.tag || message.author?.username || null, channelId: message.channelId || null, createdAt: message.createdAt?.toISOString?.() || null, editedAt: message.editedAt?.toISOString?.() || null, pinned: Boolean(message.pinned), attachments: [...(message.attachments?.values?.() || [])].map((item) => ({ id: item.id, name: item.name, url: item.url, size: item.size })) } : null;
const threadState = (thread) => thread ? { id: thread.id, name: thread.name, parentId: thread.parentId || null, ownerId: thread.ownerId || null, archived: Boolean(thread.archived), locked: Boolean(thread.locked), autoArchiveDuration: thread.autoArchiveDuration ?? null, rateLimitPerUser: thread.rateLimitPerUser ?? null } : null;
const emojiState = (emoji) => emoji ? { id: emoji.id, name: emoji.name, animated: Boolean(emoji.animated), available: emoji.available !== false, managed: Boolean(emoji.managed), roles: emoji.roles?.cache?.map?.((role) => ({ id: role.id, name: role.name })) || [] } : null;
const stickerState = (sticker) => sticker ? { id: sticker.id, name: sticker.name, description: sticker.description || null, tags: sticker.tags || null, format: sticker.format ?? null, available: sticker.available !== false } : null;
const scheduledEventState = (event) => event ? { id: event.id, name: event.name, description: event.description || null, channelId: event.channelId || null, creatorId: event.creatorId || null, status: event.status, privacyLevel: event.privacyLevel, entityType: event.entityType, scheduledStartAt: event.scheduledStartAt?.toISOString?.() || null, scheduledEndAt: event.scheduledEndAt?.toISOString?.() || null, entityMetadata: event.entityMetadata || null } : null;

function ownerIds() {
  return security.getBotOwnerIds();
}

async function ensurePrivateCommandRegistration(client, guildId) {
  if (!client?.application || !guildId) return false;
  const ownerGuild = client.guilds.cache.get(String(guildId)) || await client.guilds.fetch(String(guildId)).catch(() => null);
  if (!ownerGuild) return false;

  try {
    const globals = await client.application.commands.fetch();
    const leaked = globals.find((command) => command.name === 'commandcenter');
    if (leaked) {
      await leaked.delete();
      console.warn('[Audit Intelligence] Removed leaked global /commandcenter registration.');
    }
  } catch (error) {
    console.warn('[Audit Intelligence] Global command privacy check failed:', error?.message || error);
  }

  try {
    const commands = await ownerGuild.commands.fetch();
    const existing = commands.find((command) => command.name === 'commandcenter');
    const payload = module.exports.data.toJSON();
    if (existing) await existing.edit(payload);
    else await ownerGuild.commands.create(payload);
    console.log(`[Audit Intelligence] /commandcenter registered privately in ${ownerGuild.name} (${ownerGuild.id}).`);
    return true;
  } catch (error) {
    console.warn('[Audit Intelligence] Private /commandcenter registration failed:', error?.message || error);
    return false;
  }
}

async function sendCommandCenterSetupDm(client) {
  const ownerId = security.getBotOwnerId();
  if (!ownerId) {
    console.warn('[Audit Intelligence] Command Center bootstrap skipped: no configured Goliath owner.');
    return false;
  }
  const user = await client.users.fetch(ownerId).catch(() => null);
  if (!user) return false;
  const dm = await user.createDM().catch(() => null);
  if (!dm) {
    console.warn('[Audit Intelligence] Unable to DM the Goliath owner for Command Center setup.');
    return false;
  }
  await dm.send(buildCommandCenterSetup(client)).catch((error) => console.warn('[Audit Intelligence] Command Center setup DM failed:', error?.message || error));
  return true;
}

async function initializeCommandCenter(client) {
  const config = auditStore.getConfig();
  const guildId = String(config.commandCenter?.guildId || '');
  if (!guildId) return sendCommandCenterSetupDm(client);
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.warn(`[Audit Intelligence] Configured Command Center guild ${guildId} is unavailable.`);
    return false;
  }
  await auditRouter.ensureCommandCenter(client, guild);
  return ensurePrivateCommandRegistration(client, guild.id);
}

async function handleCommandCenterInteraction(client, interaction) {
  const customId = String(interaction?.customId || '');
  if (!customId.startsWith('owner:commandcenter:')) return false;

  if (!security.isBotOwner(interaction.user?.id)) {
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Owner-only control.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  if (customId === 'owner:commandcenter:destination' && interaction.isStringSelectMenu?.()) {
    const guildId = String(interaction.values?.[0] || '');
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      await interaction.update({ content: '❌ That guild is no longer available to Goliath.', embeds: [], components: [] }).catch(() => null);
      return true;
    }
    const ownerMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!ownerMember) {
      await interaction.update({ content: '❌ You must be a member of the selected private server.', embeds: [], components: [] }).catch(() => null);
      return true;
    }

    auditStore.updateConfig({ commandCenter: { guildId: guild.id, categoryId: null, channelId: null, messageId: null } });
    const context = await auditRouter.ensureCommandCenter(client, guild);
    const registered = await ensurePrivateCommandRegistration(client, guild.id);
    const link = context?.channel ? `https://discord.com/channels/${guild.id}/${context.channel.id}` : null;
    await interaction.update({
      content: registered
        ? `✅ **Goliath Command Center secured.**\n\nDestination: **${guild.name}**\n/commandcenter is registered **only** in that server.${link ? `\n\nOpen: ${link}` : ''}`
        : `⚠️ Command Center channels were prepared in **${guild.name}**, but private command registration needs attention.`,
      embeds: [],
      components: [],
    }).catch(() => null);
    return true;
  }

  const config = auditStore.getConfig();
  if (!config.commandCenter?.guildId || String(interaction.guildId || '') !== String(config.commandCenter.guildId)) {
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ This control is only valid inside your private Goliath Command Center server.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  if (customId === 'owner:commandcenter:refresh' && interaction.isButton?.()) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
    const context = await auditRouter.ensureCommandCenter(client, interaction.guild);
    await interaction.editReply({ content: context ? '✅ Command Center refreshed.' : '❌ Command Center refresh failed.' }).catch(() => null);
    return true;
  }

  if (interaction.isButton?.()) {
    await interaction.reply({ content: 'ℹ️ This Command Center section is ready for the next routing/monitoring build phase.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }
  return false;
}

function auditChannelContext(channel) {
  const topic = String(channel?.topic || '');
  const userMatch = topic.match(/GOLIATH_AUDIT_USER:(\d+):(\d+)/);
  if (!userMatch) return null;
  return { sourceGuildId: userMatch[1], userId: userMatch[2] };
}

function interactionKind(interaction) {
  if (interaction?.isChatInputCommand?.()) return 'command';
  if (interaction?.isButton?.()) return 'button';
  if (interaction?.isStringSelectMenu?.()) return 'string-select';
  if (interaction?.isUserSelectMenu?.()) return 'user-select';
  if (interaction?.isRoleSelectMenu?.()) return 'role-select';
  if (interaction?.isChannelSelectMenu?.()) return 'channel-select';
  if (interaction?.isMentionableSelectMenu?.()) return 'mentionable-select';
  if (interaction?.isModalSubmit?.()) return 'modal';
  if (interaction?.isContextMenuCommand?.()) return 'context-menu';
  return 'interaction';
}

function safeInteractionOptions(interaction) {
  if (!interaction?.isChatInputCommand?.()) return null;
  const simplify = (items = []) => items.map((item) => ({
    name: item.name,
    type: item.type,
    value: item.value ?? null,
    options: Array.isArray(item.options) ? simplify(item.options) : undefined,
  }));
  return simplify(interaction.options?.data || []);
}

function interactionValues(interaction) {
  if (Array.isArray(interaction?.values)) return interaction.values.slice(0, 25);
  if (interaction?.isUserSelectMenu?.() || interaction?.isRoleSelectMenu?.() || interaction?.isChannelSelectMenu?.() || interaction?.isMentionableSelectMenu?.()) {
    return Array.isArray(interaction.values) ? interaction.values.slice(0, 25) : [];
  }
  return null;
}

function interactionLabel(interaction, kind) {
  if (kind === 'command') return `/${interaction.commandName || 'unknown'}`;
  if (kind === 'context-menu') return interaction.commandName || 'context menu';
  return String(interaction.customId || kind || 'interaction');
}

async function captureGoliathInteraction(client, interaction) {
  if (!interaction?.guild || !interaction?.user) return false;
  const ownerAuditGuildId = auditRouter.getOwnerAuditGuildId();
  if (ownerAuditGuildId && String(interaction.guildId || '') === String(ownerAuditGuildId)) return false;
  if (String(interaction.customId || '').startsWith('owner:audit:') || String(interaction.customId || '').startsWith('owner:commandcenter:')) return false;
  if (interaction?.isAutocomplete?.()) return false;

  const kind = interactionKind(interaction);
  const label = interactionLabel(interaction, kind);
  const actor = {
    id: interaction.user.id,
    username: interaction.user.username || null,
    globalName: interaction.user.globalName || null,
    bot: Boolean(interaction.user.bot),
  };

  const metadata = {
    interactionId: interaction.id || null,
    interactionType: interaction.type ?? null,
    kind,
    commandName: interaction.commandName || null,
    commandId: interaction.commandId || null,
    customId: interaction.customId || null,
    channelId: interaction.channelId || null,
    messageId: interaction.message?.id || null,
    options: safeInteractionOptions(interaction),
    values: interactionValues(interaction),
  };

  await audit.captureGoliathAction(client, {
    type: `goliath.interaction.${kind}`,
    category: 'goliath',
    action: 'execute',
    title: kind === 'command' ? 'Goliath Command Used' : 'Goliath Interaction Used',
    icon: '🤖',
    guild: interaction.guild,
    channel: interaction.channel || null,
    user: interaction.user,
    actor,
    target: { id: interaction.id || null, label },
    summary: `<@${interaction.user.id}> used **${label}** through Goliath.`,
    metadata,
  });
  return true;
}

async function handleOwnerAuditInteraction(client, interaction) {
  const customId = String(interaction?.customId || '');
  if (!interaction?.isButton?.() || !customId.startsWith('owner:audit:')) return false;

  const ownerGuildId = auditRouter.getOwnerAuditGuildId();
  if (!ownerGuildId || String(interaction.guildId || '') !== ownerGuildId) {
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ This control is only available in the private Goliath audit server.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  if (!security.isBotOwner(interaction.user?.id)) {
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Owner-only control.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  const context = auditChannelContext(interaction.channel);
  if (!context) {
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ This is not a Goliath user intelligence channel.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  const sourceGuild = client.guilds.cache.get(context.sourceGuildId) || await client.guilds.fetch(context.sourceGuildId).catch(() => null);
  if (!sourceGuild) {
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Source guild is not currently available to Goliath.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  if (customId === 'owner:audit:refresh') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
    const refreshed = await auditRouter.refreshUserSummary(client, sourceGuild, interaction.channel, context.userId, true);
    await interaction.editReply({ content: refreshed ? '✅ User Intelligence summary refreshed.' : '❌ Summary refresh failed.' }).catch(() => null);
    return true;
  }

  const section = customId.slice('owner:audit:'.length);
  if (!['deep', 'guilds', 'moderation', 'roles', 'voice', 'timeline'].includes(section)) return false;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
  const report = await buildReport(client, context.userId);
  const embed = buildUserIntelligenceSectionEmbed(report, section, sourceGuild);
  await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
  return true;
}

function changedRoleIds(member) {
  return new Set(member?.roles?.cache?.keys?.() || []);
}

async function findRemoval(guild, userId) {
  await wait(600);
  for (const type of ['member.kick', 'member.prune']) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const correlation = await audit.correlate(guild, type, userId, Date.now(), { maxAgeMs: type === 'member.prune' ? 45000 : 30000, allowTargetless: type === 'member.prune', limit: 10 });
      if (correlation) return { type, correlation };
      if (attempt < 2) await wait(500 * (attempt + 1));
    }
  }
  return { type: 'member.leave', correlation: null };
}

async function captureMemberUpdate(client, before, after) {
  const common = { guild: after.guild, member: after, target: { id: after.id, label: after.user?.tag || after.user?.username } };
  let emitted = false;

  const beforeRoles = changedRoleIds(before);
  const afterRoles = changedRoleIds(after);
  const added = [...afterRoles].filter((id) => !beforeRoles.has(id) && id !== after.guild.id).map((id) => after.guild.roles.cache.get(id)).filter(Boolean);
  const removed = [...beforeRoles].filter((id) => !afterRoles.has(id) && id !== after.guild.id).map((id) => before.guild.roles.cache.get(id)).filter(Boolean);
  if (added.length || removed.length) {
    emitted = true;
    await audit.capture(client, { ...common, type: 'member.roles', category: 'member', action: 'update', title: 'Member Roles Changed', icon: '🎭', before: { roles: before.roles.cache.filter((role) => role.id !== before.guild.id).map((role) => ({ id: role.id, name: role.name, position: role.position })) }, after: { roles: after.roles.cache.filter((role) => role.id !== after.guild.id).map((role) => ({ id: role.id, name: role.name, position: role.position })) }, metadata: { added: added.map((role) => ({ id: role.id, name: role.name })), removed: removed.map((role) => ({ id: role.id, name: role.name })) } });
  }

  if ((before.nickname || null) !== (after.nickname || null)) {
    emitted = true;
    await audit.capture(client, { ...common, type: 'member.nickname', category: 'member', action: 'update', title: 'Nickname Changed', icon: '🏷️', before: { nickname: before.nickname || null, displayName: before.displayName || null }, after: { nickname: after.nickname || null, displayName: after.displayName || null } });
  }

  const beforeTimeout = before.communicationDisabledUntil?.toISOString?.() || null;
  const afterTimeout = after.communicationDisabledUntil?.toISOString?.() || null;
  if (beforeTimeout !== afterTimeout) {
    emitted = true;
    const title = !beforeTimeout && afterTimeout ? 'Member Timed Out' : beforeTimeout && !afterTimeout ? 'Member Timeout Removed' : 'Member Timeout Changed';
    await audit.capture(client, { ...common, type: 'member.timeout', category: 'moderation', action: 'update', title, icon: '⏳', before: { timedOutUntil: beforeTimeout }, after: { timedOutUntil: afterTimeout } });
  }

  if (Boolean(before.pending) !== Boolean(after.pending)) {
    emitted = true;
    await audit.capture(client, { ...common, type: 'member.verification', category: 'member', action: 'update', title: 'Membership Screening State Changed', icon: '✅', before: { pending: Boolean(before.pending) }, after: { pending: Boolean(after.pending) } });
  }

  if (!emitted) {
    await audit.capture(client, { ...common, type: 'member.update', category: 'member', action: 'update', title: 'Member Updated', icon: '👤', before: snapshotMember(before), after: snapshotMember(after) });
  }
}

function registerAuditEvents(client) {
  if (!client || wired.has(client)) return false;
  wired.add(client);

  client.on(Events.InteractionCreate, (interaction) => {
    handleCommandCenterInteraction(client, interaction).catch((error) => console.warn('[Audit Intelligence] command center interaction failed:', error?.message || error));
    handleOwnerAuditInteraction(client, interaction).catch((error) => console.warn('[Audit Intelligence] owner interaction failed:', error?.message || error));
    captureGoliathInteraction(client, interaction).catch((error) => console.warn('[Audit Intelligence] Goliath interaction capture failed:', error?.message || error));
  });
  client.once(Events.ClientReady, () => initializeCommandCenter(client).catch((error) => console.warn('[Audit Intelligence] Command Center startup failed:', error?.message || error)));
  client.on(Events.GuildMemberAdd, (member) => audit.capture(client, { type: 'member.join', category: 'member', action: 'join', title: 'Member Joined', icon: '📥', guild: member.guild, member, target: { id: member.id, label: member.user?.tag || member.user?.username }, after: snapshotMember(member) }));
  client.on(Events.GuildMemberRemove, async (member) => {
    const removal = await findRemoval(member.guild, member.id).catch(() => ({ type: 'member.leave', correlation: null }));
    if (removal.type === 'member.kick') {
      return audit.capture(client, { type: 'member.kick', category: 'moderation', action: 'delete', title: 'Member Kicked', icon: '👢', guild: member.guild, member, target: { id: member.id, label: member.user?.tag || member.user?.username }, actor: removal.correlation?.actor || null, reason: removal.correlation?.reason || null, before: snapshotMember(member), metadata: { auditLog: removal.correlation } });
    }
    if (removal.type === 'member.prune') {
      return audit.capture(client, { type: 'member.prune', category: 'moderation', action: 'delete', title: 'Member Pruned / Removed', icon: '🧹', guild: member.guild, member, target: { id: member.id, label: member.user?.tag || member.user?.username }, actor: removal.correlation?.actor || null, reason: removal.correlation?.reason || null, before: snapshotMember(member), metadata: { auditLog: removal.correlation } });
    }
    return audit.capture(client, { type: 'member.leave', category: 'member', action: 'leave', title: 'Member Left', icon: '📤', guild: member.guild, member, target: { id: member.id, label: member.user?.tag || member.user?.username }, before: snapshotMember(member) });
  });
  client.on(Events.GuildMemberUpdate, (before, after) => captureMemberUpdate(client, before, after).catch((error) => console.warn('[Audit Intelligence] member update capture failed:', error?.message || error)));
  client.on(Events.GuildBanAdd, (ban) => audit.capture(client, { type: 'member.ban', category: 'moderation', action: 'create', title: 'Member Banned', icon: '🔨', guild: ban.guild, user: ban.user, target: { id: ban.user.id, label: ban.user.tag || ban.user.username }, reason: ban.reason || null }));
  client.on(Events.GuildBanRemove, (ban) => audit.capture(client, { type: 'member.unban', category: 'moderation', action: 'delete', title: 'Member Unbanned', icon: '🕊️', guild: ban.guild, user: ban.user, target: { id: ban.user.id, label: ban.user.tag || ban.user.username } }));

  client.on(Events.GuildRoleCreate, (role) => audit.capture(client, { type: 'role.create', category: 'role', action: 'create', title: 'Role Created', icon: '🎭', guild: role.guild, target: { id: role.id, label: role.name }, after: roleState(role) }));
  client.on(Events.GuildRoleUpdate, (before, after) => audit.capture(client, { type: 'role.update', category: 'role', action: 'update', title: 'Role Updated', icon: '🎭', guild: after.guild, target: { id: after.id, label: after.name }, before: roleState(before), after: roleState(after) }));
  client.on(Events.GuildRoleDelete, (role) => audit.capture(client, { type: 'role.delete', category: 'role', action: 'delete', title: 'Role Deleted', icon: '🗑️', guild: role.guild, target: { id: role.id, label: role.name }, before: roleState(role) }));

  client.on(Events.ChannelCreate, (channel) => channel.guild && audit.capture(client, { type: 'channel.create', category: 'channel', action: 'create', title: 'Channel Created', icon: '🆕', guild: channel.guild, channel, target: { id: channel.id, label: channel.name }, after: channelState(channel) }));
  client.on(Events.ChannelUpdate, (before, after) => after.guild && audit.capture(client, { type: 'channel.update', category: 'channel', action: 'update', title: 'Channel Updated', icon: '📝', guild: after.guild, channel: after, target: { id: after.id, label: after.name }, before: channelState(before), after: channelState(after) }));
  client.on(Events.ChannelDelete, (channel) => channel.guild && audit.capture(client, { type: 'channel.delete', category: 'channel', action: 'delete', title: 'Channel Deleted', icon: '🗑️', guild: channel.guild, channel, target: { id: channel.id, label: channel.name }, before: channelState(channel) }));

  client.on(Events.ThreadCreate, (thread) => thread.guild && audit.capture(client, { type: 'thread.create', category: 'thread', action: 'create', title: 'Thread Created', icon: '🧵', guild: thread.guild, channel: thread, target: { id: thread.id, label: thread.name }, after: threadState(thread) }));
  client.on(Events.ThreadUpdate, (before, after) => after.guild && audit.capture(client, { type: 'thread.update', category: 'thread', action: 'update', title: 'Thread Updated', icon: '🧵', guild: after.guild, channel: after, target: { id: after.id, label: after.name }, before: threadState(before), after: threadState(after) }));
  client.on(Events.ThreadDelete, (thread) => thread.guild && audit.capture(client, { type: 'thread.delete', category: 'thread', action: 'delete', title: 'Thread Deleted', icon: '🗑️', guild: thread.guild, target: { id: thread.id, label: thread.name }, before: threadState(thread) }));

  client.on(Events.GuildEmojiCreate, (emoji) => audit.capture(client, { type: 'emoji.create', category: 'expression', action: 'create', title: 'Emoji Created', icon: '😀', guild: emoji.guild, target: { id: emoji.id, label: emoji.name }, after: emojiState(emoji) }));
  client.on(Events.GuildEmojiUpdate, (before, after) => audit.capture(client, { type: 'emoji.update', category: 'expression', action: 'update', title: 'Emoji Updated', icon: '😀', guild: after.guild, target: { id: after.id, label: after.name }, before: emojiState(before), after: emojiState(after) }));
  client.on(Events.GuildEmojiDelete, (emoji) => audit.capture(client, { type: 'emoji.delete', category: 'expression', action: 'delete', title: 'Emoji Deleted', icon: '🗑️', guild: emoji.guild, target: { id: emoji.id, label: emoji.name }, before: emojiState(emoji) }));
  client.on(Events.GuildStickerCreate, (sticker) => audit.capture(client, { type: 'sticker.create', category: 'expression', action: 'create', title: 'Sticker Created', icon: '🏷️', guild: sticker.guild, target: { id: sticker.id, label: sticker.name }, after: stickerState(sticker) }));
  client.on(Events.GuildStickerUpdate, (before, after) => audit.capture(client, { type: 'sticker.update', category: 'expression', action: 'update', title: 'Sticker Updated', icon: '🏷️', guild: after.guild, target: { id: after.id, label: after.name }, before: stickerState(before), after: stickerState(after) }));
  client.on(Events.GuildStickerDelete, (sticker) => audit.capture(client, { type: 'sticker.delete', category: 'expression', action: 'delete', title: 'Sticker Deleted', icon: '🗑️', guild: sticker.guild, target: { id: sticker.id, label: sticker.name }, before: stickerState(sticker) }));

  client.on(Events.MessageUpdate, (before, after) => after.guild && audit.capture(client, { type: 'message.update', category: 'message', action: 'update', title: 'Message Edited', icon: '✏️', guild: after.guild, channel: after.channel, user: after.author, target: { id: after.id, label: `Message ${after.id}` }, before: messageState(before), after: messageState(after) }));
  client.on(Events.MessageDelete, (message) => message.guild && audit.capture(client, { type: 'message.delete', category: 'message', action: 'delete', title: 'Message Deleted', icon: '🗑️', guild: message.guild, channel: message.channel, user: message.author, target: { id: message.id, label: `Message ${message.id}` }, before: messageState(message) }));
  client.on(Events.MessageBulkDelete, (messages, channel) => channel.guild && audit.capture(client, { type: 'message.bulkDelete', category: 'message', action: 'delete', title: 'Messages Bulk Deleted', icon: '🧹', guild: channel.guild, channel, target: { id: channel.id, label: `${messages.size} messages` }, before: [...messages.values()].slice(0, 100).map(messageState), metadata: { count: messages.size } }));
  client.on(Events.MessageReactionAdd, (reaction, user) => reaction.message?.guild && audit.capture(client, { type: 'reaction.add', category: 'message', action: 'create', title: 'Reaction Added', icon: '➕', guild: reaction.message.guild, channel: reaction.message.channel, user, target: { id: reaction.message.id, label: `Message ${reaction.message.id}` }, after: { emoji: reaction.emoji?.toString?.() || reaction.emoji?.name || null, emojiId: reaction.emoji?.id || null } }));
  client.on(Events.MessageReactionRemove, (reaction, user) => reaction.message?.guild && audit.capture(client, { type: 'reaction.remove', category: 'message', action: 'delete', title: 'Reaction Removed', icon: '➖', guild: reaction.message.guild, channel: reaction.message.channel, user, target: { id: reaction.message.id, label: `Message ${reaction.message.id}` }, before: { emoji: reaction.emoji?.toString?.() || reaction.emoji?.name || null, emojiId: reaction.emoji?.id || null } }));

  client.on(Events.VoiceStateUpdate, (before, after) => {
    const guild = after.guild || before.guild;
    if (!guild || before.channelId === after.channelId && before.serverMute === after.serverMute && before.serverDeaf === after.serverDeaf) return;
    audit.capture(client, { type: 'voice.update', category: 'voice', action: 'update', title: 'Voice State Changed', icon: '🔊', guild, member: after.member || before.member, target: { id: after.id || before.id, label: after.member?.user?.tag || before.member?.user?.tag }, before: { channelId: before.channelId, serverMute: before.serverMute, serverDeaf: before.serverDeaf }, after: { channelId: after.channelId, serverMute: after.serverMute, serverDeaf: after.serverDeaf } });
  });

  client.on(Events.InviteCreate, (invite) => invite.guild && audit.capture(client, { type: 'invite.create', category: 'invite', action: 'create', title: 'Invite Created', icon: '🔗', guild: invite.guild, channel: invite.channel, target: { id: invite.code, label: invite.code }, after: { code: invite.code, inviterId: invite.inviterId || null, maxAge: invite.maxAge, maxUses: invite.maxUses, temporary: invite.temporary } }));
  client.on(Events.InviteDelete, (invite) => invite.guild && audit.capture(client, { type: 'invite.delete', category: 'invite', action: 'delete', title: 'Invite Deleted', icon: '🔗', guild: invite.guild, channel: invite.channel, target: { id: invite.code, label: invite.code }, before: { code: invite.code, inviterId: invite.inviterId || null, maxAge: invite.maxAge, maxUses: invite.maxUses, temporary: invite.temporary } }));

  client.on(Events.GuildScheduledEventCreate, (event) => audit.capture(client, { type: 'scheduledEvent.create', category: 'scheduledEvent', action: 'create', title: 'Scheduled Event Created', icon: '📅', guild: event.guild, target: { id: event.id, label: event.name }, after: scheduledEventState(event) }));
  client.on(Events.GuildScheduledEventUpdate, (before, after) => audit.capture(client, { type: 'scheduledEvent.update', category: 'scheduledEvent', action: 'update', title: 'Scheduled Event Updated', icon: '📅', guild: after.guild, target: { id: after.id, label: after.name }, before: scheduledEventState(before), after: scheduledEventState(after) }));
  client.on(Events.GuildScheduledEventDelete, (event) => audit.capture(client, { type: 'scheduledEvent.delete', category: 'scheduledEvent', action: 'delete', title: 'Scheduled Event Deleted', icon: '🗑️', guild: event.guild, target: { id: event.id, label: event.name }, before: scheduledEventState(event) }));

  client.on(Events.WebhooksUpdate, (channel) => channel.guild && audit.capture(client, { type: 'webhook.update', category: 'webhook', action: 'update', title: 'Webhook Configuration Changed', icon: '🪝', guild: channel.guild, channel, target: { id: channel.id, label: channel.name }, metadata: { note: 'Discord signals that one or more webhooks in this channel changed; exact webhook details depend on audit-log visibility.' } }));

  if (Events.AutoModerationRuleCreate) client.on(Events.AutoModerationRuleCreate, (rule) => audit.capture(client, { type: 'automod.ruleCreate', category: 'automod', action: 'create', title: 'AutoMod Rule Created', icon: '🛡️', guild: rule.guild, target: { id: rule.id, label: rule.name }, after: { id: rule.id, name: rule.name, enabled: rule.enabled, eventType: rule.eventType, triggerType: rule.triggerType, actions: rule.actions } }));
  if (Events.AutoModerationRuleUpdate) client.on(Events.AutoModerationRuleUpdate, (before, after) => audit.capture(client, { type: 'automod.ruleUpdate', category: 'automod', action: 'update', title: 'AutoMod Rule Updated', icon: '🛡️', guild: after.guild, target: { id: after.id, label: after.name }, before: { id: before.id, name: before.name, enabled: before.enabled, eventType: before.eventType, triggerType: before.triggerType, actions: before.actions }, after: { id: after.id, name: after.name, enabled: after.enabled, eventType: after.eventType, triggerType: after.triggerType, actions: after.actions } }));
  if (Events.AutoModerationRuleDelete) client.on(Events.AutoModerationRuleDelete, (rule) => audit.capture(client, { type: 'automod.ruleDelete', category: 'automod', action: 'delete', title: 'AutoMod Rule Deleted', icon: '🗑️', guild: rule.guild, target: { id: rule.id, label: rule.name }, before: { id: rule.id, name: rule.name, enabled: rule.enabled, eventType: rule.eventType, triggerType: rule.triggerType, actions: rule.actions } }));
  if (Events.AutoModerationActionExecution) client.on(Events.AutoModerationActionExecution, (execution) => audit.capture(client, { type: 'automod.action', category: 'automod', action: 'execute', title: 'AutoMod Action Executed', icon: '🛡️', guild: execution.guild, channel: execution.channel || null, user: execution.member?.user || null, member: execution.member || null, target: { id: execution.userId || execution.member?.id || null, label: execution.member?.user?.tag || execution.userId || 'Unknown user' }, metadata: { ruleId: execution.ruleId || null, ruleTriggerType: execution.ruleTriggerType ?? null, action: execution.action || null, matchedKeyword: execution.matchedKeyword || null, matchedContent: execution.matchedContent || null, content: execution.content || null } }));

  client.on(Events.GuildUpdate, (before, after) => audit.capture(client, { type: 'guild.update', category: 'guild', action: 'update', title: 'Guild Settings Updated', icon: '🏰', guild: after, target: { id: after.id, label: after.name }, before: guildState(before), after: guildState(after) }));

  console.log('[Audit Intelligence] Discord event capture registered.');
  return true;
}

const commandCenterCommand = {
  category: 'Owner',
  help: { name: 'commandcenter', description: 'Open the private Goliath owner Command Center.', usage: '/commandcenter' },
  access: { ownerOnly: true },
  privateGuildOnly: true,
  data: new SlashCommandBuilder()
    .setName('commandcenter')
    .setDescription('Open the private Goliath owner Command Center')
    .setDMPermission(false),
  async execute(interaction) {
    if (!security.isBotOwner(interaction.user?.id)) {
      return interaction.reply({ content: '❌ This command is restricted to the Goliath owner.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    const config = auditStore.getConfig();
    if (!config.commandCenter?.guildId || String(interaction.guildId || '') !== String(config.commandCenter.guildId)) {
      return interaction.reply({ content: '❌ /commandcenter is only valid inside your private Goliath Command Center server.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    const context = await auditRouter.ensureCommandCenter(interaction.client, interaction.guild);
    const link = context?.channel ? `https://discord.com/channels/${interaction.guildId}/${context.channel.id}` : null;
    return interaction.reply({ content: context ? `✅ Command Center ready.${link ? `\n${link}` : ''}` : '❌ Command Center could not be prepared.', flags: MessageFlags.Ephemeral }).catch(() => null);
  },
};

module.exports = {
  ...commandCenterCommand,
  registerAuditEvents,
  handleOwnerAuditInteraction,
  handleCommandCenterInteraction,
  captureGoliathInteraction,
  initializeCommandCenter,
  ensurePrivateCommandRegistration,
};
