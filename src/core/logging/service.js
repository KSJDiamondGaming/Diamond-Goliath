const { EmbedBuilder } = require('discord.js');
const guildManager = require('../guild/guildManager');

function resolveChannelType(type = '') {
  if (type.startsWith('automod')) return 'automod';
  if (type.startsWith('moderation')) return 'moderation';
  if (type.startsWith('admin')) return 'admin';
  if (type.startsWith('member')) return 'member';
  if (type.startsWith('voice')) return 'voice';

  if (type.startsWith('message')) {
    if (type.includes('delete')) return 'messageDelete';
    if (type.includes('edit')) return 'messageEdit';
    return 'messageDelete';
  }

  return 'general';
}

function resolveEventName(type = '') {
  if (type.startsWith('automod')) return 'automodActions';
  if (type.startsWith('moderation')) return 'moderationActions';
  if (type.startsWith('admin')) return 'adminActions';
  if (type.startsWith('member')) return 'memberUpdate';
  if (type.startsWith('voice')) return 'voiceMove';

  if (type === 'member.join') return 'memberJoin';
  if (type === 'member.leave') return 'memberLeave';

  if (type === 'message.delete') return 'messageDelete';
  if (type === 'message.edit') return 'messageEdit';

  if (type === 'voice.join') return 'voiceJoin';
  if (type === 'voice.leave') return 'voiceLeave';
  if (type === 'voice.move') return 'voiceMove';

  return type;
}

function formatType(type = 'general') {
  return String(type)
    .split('.')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatUser(user, fallback = 'Unknown') {
  if (!user) return fallback;

  const name =
    user.tag ||
    user.username ||
    user.displayName ||
    user.name ||
    fallback;

  return `${name} (${user.id || 'N/A'})`;
}

function normalizeFields(fields = []) {
  if (!Array.isArray(fields)) return [];

  return fields
    .filter((field) => field?.name && field?.value !== undefined && field?.value !== null)
    .map((field) => ({
      name: String(field.name).slice(0, 256),
      value: String(field.value).slice(0, 1024),
      inline: field.inline ?? false,
    }));
}

function buildEmbed(type, data = {}) {
  const embed = new EmbedBuilder()
    .setColor(data.color || '#5865F2')
    .setTitle(data.title || formatType(type))
    .setTimestamp();

  const fields = [];

  if (data.user) {
    fields.push({
      name: 'User',
      value: formatUser(data.user),
      inline: false,
    });
  }

  if (data.executor) {
    fields.push({
      name: 'Executor',
      value: formatUser(data.executor),
      inline: false,
    });
  }

  if (data.target) {
    fields.push({
      name: 'Target',
      value: formatUser(data.target),
      inline: false,
    });
  }

  if (data.reason) {
    fields.push({
      name: 'Reason',
      value: String(data.reason).slice(0, 1024),
      inline: false,
    });
  }

  fields.push(...normalizeFields(data.fields));

  if (fields.length) {
    embed.addFields(fields);
  }

  if (data.description) {
    embed.setDescription(String(data.description).slice(0, 4096));
  }

  return embed;
}

async function send(guild, type, data = {}) {
  if (!guild?.id || !type) return false;

  try {
    const eventName = resolveEventName(type);

    if (!guildManager.isLogEventEnabled(guild.id, eventName)) {
      return false;
    }

    const channelType = resolveChannelType(type);
    const channelId = guildManager.getLogChannelId(
      guild.id,
      channelType,
      'general'
    );

    if (!channelId) return false;

    const channel =
      guild.channels.cache.get(channelId) ||
      (await guild.channels.fetch(channelId).catch(() => null));

    if (!channel || !channel.isTextBased()) return false;

    const embed = buildEmbed(type, data);

    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.error(`Log error in guild ${guild?.id || 'unknown'}:`, error);
    return false;
  }
}

module.exports = {
  send,
  buildEmbed,
  resolveChannelType,
  resolveEventName,
};
