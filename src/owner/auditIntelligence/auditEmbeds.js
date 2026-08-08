'use strict';

const { EmbedBuilder } = require('discord.js');

const COLORS = {
  create: 0x57F287,
  update: 0xFEE75C,
  delete: 0xED4245,
  moderation: 0xEB459E,
  member: 0x5865F2,
  voice: 0x3498DB,
  message: 0x95A5A6,
  system: 0x2F3136,
};

function family(event) {
  if (event.category === 'moderation') return 'moderation';
  if (event.category === 'voice') return 'voice';
  if (event.category === 'message') return 'message';
  if (event.category === 'member') return 'member';
  if (event.action === 'create' || event.action === 'join') return 'create';
  if (event.action === 'delete' || event.action === 'leave') return 'delete';
  if (event.action === 'update') return 'update';
  return 'system';
}

function compact(value, max = 950) {
  if (value === null || value === undefined || value === '') return 'None';
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function buildAuditEmbed(event) {
  const actor = event.actor?.id ? `<@${event.actor.id}> (${event.actor.id})` : event.actor?.label || 'Unknown / not exposed by Discord';
  const user = event.user?.id ? `<@${event.user.id}> (${event.user.id})` : null;
  const target = user || event.target?.label || event.target?.name || event.target?.id || 'Unknown';

  const embed = new EmbedBuilder()
    .setColor(COLORS[family(event)] || COLORS.system)
    .setTitle(`${event.icon || '🧾'} ${event.title || event.type}`)
    .setDescription(event.summary || `Audit event detected in **${event.guildName || 'Unknown Guild'}**.`)
    .addFields(
      { name: 'Action', value: `\`${event.type}\``, inline: true },
      { name: 'Source', value: event.source || 'Discord', inline: true },
      { name: 'Result', value: event.result || 'Observed', inline: true },
      { name: 'Target', value: compact(target), inline: false },
      { name: 'Actor', value: compact(actor), inline: false },
    )
    .setFooter({ text: `Goliath Audit • ${event.eventId}` })
    .setTimestamp(new Date(event.timestamp));

  if (event.channel?.id) embed.addFields({ name: 'Channel', value: `<#${event.channel.id}> (${event.channel.id})`, inline: false });
  if (event.reason) embed.addFields({ name: 'Reason', value: compact(event.reason), inline: false });
  if (event.before !== undefined) embed.addFields({ name: 'Before', value: `\`\`\`json\n${compact(event.before)}\n\`\`\``, inline: false });
  if (event.after !== undefined) embed.addFields({ name: 'After', value: `\`\`\`json\n${compact(event.after)}\n\`\`\``, inline: false });

  return embed;
}

module.exports = { buildAuditEmbed };
