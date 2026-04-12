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
  const logChannelId = guild?.settings?.modLogChannelId || guild?.modLogChannelId;

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
        value: `${target.user.tag}\n<@${target.id}>`,
        inline: true
      },
      {
        name: 'Moderator',
        value: `${moderator.tag}\n<@${moderator.id}>`,
        inline: true
      },
      {
        name: 'Reason',
        value: reason || 'No reason provided',
        inline: false
      }
    )
    .setTimestamp();

  if (metadata.duration) {
    embed.addFields({
      name: 'Duration',
      value: metadata.duration,
      inline: true
    });
  }

  if (typeof metadata.deleteDays !== 'undefined') {
    embed.addFields({
      name: 'Delete Message Days',
      value: String(metadata.deleteDays),
      inline: true
    });
  }

  await channel.send({ embeds: [embed] });
  return true;
}

module.exports = {
  sendModLog
};