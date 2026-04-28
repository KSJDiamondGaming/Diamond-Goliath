const { EmbedBuilder } = require('discord.js');

async function sendModLog({
  guild,
  target,
  moderator,
  action,
  reason,
  caseId,
  metadata = {}
}) {
  if (!guild) return false;

  const logChannelId =
    guild?.settings?.modLogChannelId || guild?.modLogChannelId;

  if (!logChannelId) return false;

  const channel = guild.channels.cache.get(logChannelId);
  if (!channel) return false;

  const embed = new EmbedBuilder()
    .setColor('#ED4245')
    .setTitle(`🛡️ Moderation Case #${caseId}`)
    .addFields(
      {
        name: 'Action',
        value: action,
        inline: true
      },
      {
        name: 'User',
        value: target
          ? `${target.user.tag}\n<@${target.id}>`
          : 'Unknown',
        inline: true
      },
      {
        name: 'Moderator',
        value: moderator
          ? `${moderator.tag}\n<@${moderator.id}>`
          : 'Unknown',
        inline: true
      },
      {
        name: 'Reason',
        value: reason || 'No reason provided',
        inline: false
      }
    )
    .setTimestamp();

  // Optional metadata
  if (metadata.duration) {
    embed.addFields({
      name: 'Duration',
      value: metadata.duration,
      inline: true
    });
  }

  if (metadata.deleteDays !== undefined) {
    embed.addFields({
      name: 'Delete Message Days',
      value: String(metadata.deleteDays),
      inline: true
    });
  }

  if (metadata.repeatTriggered) {
    embed.addFields({
      name: 'Escalation',
      value: 'Repeat behaviour detected',
      inline: true
    });
  }

  try {
    await channel.send({ embeds: [embed] });
    return true;
  } catch (err) {
    console.error('Mod log failed:', err);
    return false;
  }
}

module.exports = { sendModLog };