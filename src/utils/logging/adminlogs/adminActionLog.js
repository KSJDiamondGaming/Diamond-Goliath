const { EmbedBuilder } = require('discord.js');
const guildManager = require('../../../../dashboard/server/utils/guildManager');

function formatAdminAction(action) {
  const actions = Array.isArray(action) ? action : [action];

  const labels = {
    rolecreate: 'Role Created',
    roledelete: 'Role Deleted',
    roleupdate: 'Role Updated',

    channelcreate: 'Channel Created',
    channeldelete: 'Channel Deleted',
    channelupdate: 'Channel Updated',

    settingsupdate: 'Settings Updated',
    configupdate: 'Configuration Updated',
  };

  return actions
    .map((item) => labels[String(item).toLowerCase()] || String(item))
    .join(', ');
}

async function logAdminAction({
  guild,
  action,
  executor = null,
  target = null,
  reason = 'No reason provided',
  details = [],
  color = '#5865F2',
  title = null,
}) {
  if (!guild?.id) return;

  try {
    // 🔥 Respect dashboard toggles
    if (!guildManager.isLogEventEnabled(guild.id, 'adminActions')) return;

    const logChannelId = guildManager.getLogChannelId(
      guild.id,
      'admin',
      'general'
    );

    if (!logChannelId) return;

    const channel = await guild.channels.fetch(logChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const fields = [];

    if (executor) {
      fields.push({
        name: 'Executor',
        value: `${executor.tag || executor.username || 'Unknown'} (${executor.id})`,
        inline: false,
      });
    }

    if (target) {
      fields.push({
        name: 'Target',
        value: `${target.tag || target.name || 'Unknown'} (${target.id || 'N/A'})`,
        inline: false,
      });
    }

    if (reason) {
      fields.push({
        name: 'Reason',
        value: String(reason),
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
      .setTitle(title || `⚙️ ${formatAdminAction(action)}`)
      .addFields(fields)
      .setTimestamp();

    if (executor && typeof executor.displayAvatarURL === 'function') {
      embed.setThumbnail(executor.displayAvatarURL({ dynamic: true }));
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`Failed to log admin action in guild ${guild.id}:`, error);
  }
}

module.exports = logAdminAction;