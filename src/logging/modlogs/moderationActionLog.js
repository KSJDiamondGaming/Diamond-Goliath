const { EmbedBuilder } = require('discord.js');
const guildManager = require('../guild/guildManager');

const MODERATION_ACTION_LABELS = {
  delete: 'Message Deleted',
  warn: 'User Warned',
  dm: 'User Warned by DM',
  'warn-dm': 'User Warned & DM Sent',
  timeout: 'User Timed Out',
  mute: 'User Muted',
  unmute: 'User Unmuted',
  kick: 'User Kicked',
  ban: 'User Banned',
  unban: 'User Unbanned',
  tempban: 'User Temporarily Banned',
  tempmute: 'User Temporarily Muted',
  automod: 'AutoMod Action Taken',
};

function normalizeLogType(logType = 'mod') {
  const type = String(logType || 'general').toLowerCase();

  if (type === 'mod') return 'moderation';
  if (type === 'moderation') return 'moderation';
  if (type === 'automod') return 'automod';
  if (type === 'admin') return 'admin';

  return 'general';
}

function getEventName(channelType) {
  if (channelType === 'automod') return 'automodActions';
  if (channelType === 'admin') return 'adminActions';
  return 'moderationActions';
}

function formatModerationAction(action) {
  const actions = Array.isArray(action) ? action : [action];

  return actions
    .filter(Boolean)
    .map((item) => {
      const key = String(item).toLowerCase();
      return MODERATION_ACTION_LABELS[key] || String(item);
    })
    .join(', ');
}

function formatUser(user, fallback = 'Unknown User') {
  if (!user) return fallback;

  const name =
    user.tag ||
    user.username ||
    user.displayName ||
    user.name ||
    fallback;

  return `${name} (${user.id || 'N/A'})`;
}

function normalizeDetails(details = []) {
  if (!Array.isArray(details)) return [];

  return details
    .filter(
      (detail) =>
        detail &&
        detail.name &&
        detail.value !== undefined &&
        detail.value !== null
    )
    .map((detail) => ({
      name: String(detail.name).slice(0, 256),
      value: String(detail.value).slice(0, 1024),
      inline: Boolean(detail.inline),
    }));
}

async function resolveLogChannel(guild, channelType) {
  const logChannelId = guildManager.getLogChannelId(
    guild.id,
    channelType,
    'general'
  );

  if (!logChannelId) return null;

  const channel =
    guild.channels.cache.get(logChannelId) ||
    (await guild.channels.fetch(logChannelId).catch(() => null));

  if (!channel || !channel.isTextBased()) return null;

  return channel;
}

async function logModerationAction({
  guild,
  action,
  user = null,
  moderator = null,
  reason = 'No reason provided',
  duration = null,
  color = '#5865F2',
  caseId = null,
  details = [],
  title = null,
  logType = 'mod',
}) {
  if (!guild?.id) return false;

  try {
    const channelType = normalizeLogType(logType);
    const eventName = getEventName(channelType);

    if (!guildManager.isLogEventEnabled(guild.id, eventName)) {
      return false;
    }

    const channel = await resolveLogChannel(guild, channelType);
    if (!channel) return false;

    const fields = [];

    if (user) {
      fields.push({
        name: 'User',
        value: formatUser(user),
        inline: false,
      });
    }

    fields.push({
      name: 'Moderator',
      value: moderator ? formatUser(moderator, 'Unknown Moderator') : 'System',
      inline: false,
    });

    if (reason) {
      fields.push({
        name: 'Reason',
        value: String(reason).slice(0, 1024),
        inline: false,
      });
    }

    if (duration) {
      fields.push({
        name: 'Duration',
        value: String(duration).slice(0, 1024),
        inline: false,
      });
    }

    if (caseId) {
      fields.push({
        name: 'Case ID',
        value: `#${caseId}`,
        inline: false,
      });
    }

    fields.push(...normalizeDetails(details));

    const actionLabel = formatModerationAction(action) || 'Moderation Action';

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title || `🔐 ${actionLabel}`)
      .setTimestamp();

    if (fields.length > 0) {
      embed.addFields(fields);
    }

    if (user && typeof user.displayAvatarURL === 'function') {
      embed.setThumbnail(user.displayAvatarURL({ dynamic: true }));
    } else if (moderator && typeof moderator.displayAvatarURL === 'function') {
      embed.setThumbnail(moderator.displayAvatarURL({ dynamic: true }));
    }

    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.error(
      `Failed to log moderation action in guild ${guild?.id || 'unknown'}:`,
      error
    );
    return false;
  }
}

module.exports = logModerationAction;