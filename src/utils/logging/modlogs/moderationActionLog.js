const { EmbedBuilder } = require('discord.js');
const guildManager = require('../../../../dashboard/server/utils/guildManager');

function normalizeLogType(logType = 'mod') {
  if (logType === 'mod') return 'moderation';
  return logType || 'general';
}

function formatModerationAction(action) {
  const actions = Array.isArray(action) ? action : [action];

  const labels = {
    delete: 'Message Deleted',
    warn: 'User Warned',
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

  return actions
    .map((item) => labels[String(item).toLowerCase()] || String(item))
    .join(', ');
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
  if (!guild?.id) return;

  try {
    const channelType = normalizeLogType(logType);

    // 🔥 NEW: respect dashboard log toggles
    const eventName =
      channelType === 'automod'
        ? 'automodActions'
        : channelType === 'admin'
          ? 'adminActions'
          : 'moderationActions';

    if (!guildManager.isLogEventEnabled(guild.id, eventName)) return;

    const logChannelId = guildManager.getLogChannelId(
      guild.id,
      channelType,
      'general'
    );

    if (!logChannelId) return;

    const channel = await guild.channels.fetch(logChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const fields = [];

    if (user) {
      fields.push({
        name: 'User',
        value: `${user.tag || user.username || 'Unknown User'} (${user.id})`,
        inline: false,
      });
    }

    fields.push({
      name: 'Moderator',
      value: moderator
        ? `${moderator.tag || moderator.username || 'Unknown Moderator'} (${moderator.id})`
        : 'System',
      inline: false,
    });

    if (reason) {
      fields.push({
        name: 'Reason',
        value: String(reason),
        inline: false,
      });
    }

    if (duration) {
      fields.push({
        name: 'Duration',
        value: String(duration),
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

    if (Array.isArray(details) && details.length) {
      for (const detail of details) {
        if (!detail?.name || detail?.value === undefined || detail?.value === null) continue;

        fields.push({
          name: String(detail.name),
          value: String(detail.value),
          inline: detail.inline ?? false,
        });
      }
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title || `🛡️ ${formatModerationAction(action)}`)
      .addFields(fields)
      .setTimestamp();

    if (user && typeof user.displayAvatarURL === 'function') {
      embed.setThumbnail(user.displayAvatarURL({ dynamic: true }));
    } else if (moderator && typeof moderator.displayAvatarURL === 'function') {
      embed.setThumbnail(moderator.displayAvatarURL({ dynamic: true }));
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`Failed to log moderation action in guild ${guild.id}:`, error);
  }
}

module.exports = logModerationAction;