'use strict';

const { PermissionFlagsBits } = require('discord.js');
const { buildPreviewEmbed, TEMPLATES } = require('../embed/functions/embedPanel');
const embedTemplateManager = require('../embed/embedTemplateManager');
const guildManager = require('../../core/guild/guildManager');
const welcomeStore = require('./welcomeStore');

function formatTimestamp(timestamp, style = 'F') {
  return timestamp ? `<t:${Math.floor(timestamp / 1000)}:${style}>` : 'Unknown';
}

function getAvatar(member) {
  return member?.displayAvatarURL?.({ extension: 'png', size: 256 }) || member?.user?.displayAvatarURL?.({ extension: 'png', size: 256 }) || '';
}

function buildTemplateVariables(member) {
  const guild = member.guild;
  return {
    guild: guild.name,
    guildId: guild.id,
    guildIcon: guild.iconURL?.({ extension: 'png', size: 256 }) || '',
    guildBanner: guild.bannerURL?.({ extension: 'png', size: 1024 }) || '',
    memberCount: guild.memberCount,
    user: String(member.user),
    userMention: `<@${member.user.id}>`,
    username: member.user.username || member.user.tag || member.user.id,
    userId: member.user.id,
    userAvatar: getAvatar(member),
    memberAvatar: getAvatar(member),
    createdAt: formatTimestamp(member.user.createdTimestamp, 'F'),
    joinedAt: formatTimestamp(member.joinedTimestamp, 'F'),
    timestamp: formatTimestamp(Date.now(), 'F'),
  };
}

function getLegacySection(guildId, type) {
  return guildManager.getGuildSection(guildId, type, null) || guildManager.getGuildSection(guildId, `${type}Settings`, null) || {};
}

function getRenderedTemplate(guildId, slot, variables, fallbackTemplateId) {
  return embedTemplateManager.renderBinding(guildId, 'welcome', slot, variables, fallbackTemplateId);
}

function buildMessageData(member, type, config) {
  const guildId = member.guild.id;
  const isDm = type === 'dmWelcome';
  const legacy = getLegacySection(guildId, type);
  const templateId = isDm ? config.dmTemplateId : config.templateId;
  const slot = isDm ? 'dm_welcome' : 'welcome';
  const rendered = getRenderedTemplate(guildId, slot, buildTemplateVariables(member), templateId);

  return {
    ...(TEMPLATES[type] || {}),
    ...legacy,
    ...(rendered?.embed || {}),
    content: rendered?.content || legacy.content || legacy.message || '',
    embed: rendered?.embed || null,
    templateId: rendered?.templateId || templateId,
    templateName: rendered?.name || null,
    allowUserPing: isDm ? false : config.allowUserPing !== false,
  };
}

function buildDiscordPayload(member, type, config) {
  const messageData = buildMessageData(member, type, config);
  const fakeInteraction = { guild: member.guild, guildId: member.guild.id, user: member.user, member };
  const content = messageData.content || (messageData.allowUserPing ? `<@${member.user.id}>` : '');

  return {
    content,
    embeds: [buildPreviewEmbed(messageData, fakeInteraction)],
    allowedMentions: messageData.allowUserPing || content.includes(`<@${member.user.id}>`)
      ? { users: [member.user.id], roles: [], repliedUser: false }
      : { parse: [], repliedUser: false },
  };
}

async function resolveWelcomeChannel(guild, channelId) {
  if (!guild || !channelId) return null;
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  return channel?.isTextBased?.() ? channel : null;
}

async function sendWelcome(member, options = {}) {
  if (!member?.guild?.id || !member?.user?.id) return { publicSent: false, dmSent: false, skipped: true };

  const config = welcomeStore.getWelcomeSection(member.guild.id);
  if (config.enabled === false || (config.ignoreBots && member.user.bot)) {
    welcomeStore.incrementAnalytics(member.guild.id, { skipped: 1 });
    return { publicSent: false, dmSent: false, skipped: true };
  }

  let publicSent = false;
  let dmSent = false;
  let publicFailed = false;
  let dmFailed = false;

  if (config.channelId) {
    const channel = await resolveWelcomeChannel(member.guild, config.channelId);
    if (channel) {
      try {
        await channel.send(buildDiscordPayload(member, 'welcome', config));
        publicSent = true;
      } catch (error) {
        publicFailed = true;
        if (!options.silent) console.error('[Welcome] Failed to send public welcome:', error);
      }
    } else {
      publicFailed = true;
    }
  }

  if (config.dmEnabled) {
    try {
      await member.send(buildDiscordPayload(member, 'dmWelcome', config));
      dmSent = true;
    } catch (error) {
      dmFailed = true;
      if (!options.silent) console.warn('[Welcome] Failed to send welcome DM:', error.message || error);
    }
  }

  welcomeStore.incrementAnalytics(member.guild.id, {
    publicSent: publicSent ? 1 : 0,
    publicFailed: publicFailed ? 1 : 0,
    dmSent: dmSent ? 1 : 0,
    dmFailed: dmFailed ? 1 : 0,
    skipped: !publicSent && !dmSent && !publicFailed && !dmFailed ? 1 : 0,
  });

  return { publicSent, dmSent, publicFailed, dmFailed, skipped: false };
}

async function buildHealthReport(guild) {
  if (!guild?.id) throw new Error('Guild is required.');
  const config = welcomeStore.getWelcomeSection(guild.id);
  const channel = config.channelId ? await resolveWelcomeChannel(guild, config.channelId) : null;
  const botMember = guild.members?.me || guild.members?.cache?.get(guild.client?.user?.id) || null;
  const permissions = channel && botMember ? channel.permissionsFor(botMember) : null;
  const canView = Boolean(permissions?.has(PermissionFlagsBits.ViewChannel));
  const canSend = Boolean(permissions?.has(PermissionFlagsBits.SendMessages));
  const canEmbed = Boolean(permissions?.has(PermissionFlagsBits.EmbedLinks));

  const warnings = [
    config.enabled === false ? 'Welcome is disabled.' : null,
    config.enabled && !config.channelId && !config.dmEnabled ? 'No public welcome channel or DM welcome is configured.' : null,
    config.channelId && !channel ? `Configured welcome channel ${config.channelId} no longer exists or is not text-based.` : null,
    channel && !canView ? 'Goliath cannot view the welcome channel.' : null,
    channel && !canSend ? 'Goliath cannot send messages in the welcome channel.' : null,
    channel && !canEmbed ? 'Goliath cannot embed links in the welcome channel.' : null,
  ].filter(Boolean);

  return {
    enabled: config.enabled !== false,
    channelId: config.channelId,
    channelExists: Boolean(channel),
    channelName: channel?.name || null,
    dmEnabled: config.dmEnabled === true,
    canView,
    canSend,
    canEmbed,
    warnings,
    healthy: warnings.length === 0,
  };
}

async function repairConfiguration(guild, meta = {}) {
  const config = welcomeStore.getWelcomeSection(guild.id);
  const channel = config.channelId ? await resolveWelcomeChannel(guild, config.channelId) : null;
  return welcomeStore.updateConfig(guild.id, {
    channelId: channel ? config.channelId : null,
    enabled: channel || config.dmEnabled ? config.enabled : false,
  }, { action: 'welcome_repair', ...meta });
}

function exportConfiguration(guildId) {
  return {
    exportedAt: new Date().toISOString(),
    guildId,
    module: 'welcome',
    config: welcomeStore.getWelcomeSection(guildId),
  };
}

function resetWelcome(guildId, meta = {}) {
  return welcomeStore.resetWelcomeSection(guildId, meta);
}

module.exports = {
  formatTimestamp,
  buildTemplateVariables,
  buildMessageData,
  buildDiscordPayload,
  resolveWelcomeChannel,
  sendWelcome,
  buildHealthReport,
  repairConfiguration,
  exportConfiguration,
  resetWelcome,
};
