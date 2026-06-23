// src/functions/automod/automodDm.js

const { EmbedBuilder } = require('discord.js');

function buildAutoModDMEmbed({
  guild,
  rule,
  reason,
  action,
  messageContent,
  channel,
}) {
  return new EmbedBuilder()
    .setColor('#ED4245')
    .setTitle(`🤖 AutoMod: ${rule}`)
    .addFields(
      {
        name: 'Server',
        value: guild.name,
        inline: true,
      },
      {
        name: 'Channel',
        value: channel ? `<#${channel.id}>` : 'Unknown',
        inline: true,
      },
      {
        name: 'Rule',
        value: rule,
        inline: true,
      },
      {
        name: 'Actions Taken',
        value: action,
        inline: true,
      },
      {
        name: 'Reason',
        value: reason,
      },
      {
        name: 'Message Content',
        value: messageContent
          ? messageContent.slice(0, 1000)
          : 'None',
      }
    )
    .setThumbnail(guild.iconURL({ size: 256 }))
    .setTimestamp();
}

async function sendAutoModDM(user, guild, data = {}) {
  const embed = buildAutoModDMEmbed({
    guild,
    rule: data.rule || 'Unknown Rule',
    reason: data.reason || 'Rule triggered',
    action: data.action || 'Action taken',
    messageContent: data.messageContent || '',
    channel: data.channel || null,
  });

  try {
    await user.send({ embeds: [embed] });
    return true;
  } catch {
    return false; // user has DMs off
  }
}

module.exports = {
  sendAutoModDM,
  buildAutoModDMEmbed,
};