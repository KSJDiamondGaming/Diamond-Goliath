'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
} = require('discord.js');

const giveawaysStore = require('./giveawaysStore');

function row(...components) { return new ActionRowBuilder().addComponents(...components); }
function button(customId, label, style = ButtonStyle.Primary) { return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style); }
function formatChannel(id) { return id ? `<#${id}>` : '`Not set`'; }
function formatRoles(ids = []) { const list = Array.isArray(ids) ? ids.filter(Boolean) : []; return list.length ? list.map((id) => `<@&${id}>`).join(', ') : '`None`'; }

function buildGiveawaysAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const section = giveawaysStore.getSection(guild.id);
  const giveawayList = Object.values(section.giveaways || {});
  const active = giveawayList.filter((giveaway) => giveaway.status === 'active').length;
  const embed = new EmbedBuilder()
    .setColor(section.enabled !== false ? 0x57f287 : 0x5865f2)
    .setTitle('🎉 Giveaways')
    .setDescription([
      'Configure giveaway channels, roles and entry rules.', '',
      `**Status:** ${section.enabled !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Announcement Channel:** ${formatChannel(section.announcementChannelId)}`,
      `**Log Channel:** ${formatChannel(section.logChannelId)}`,
      `**Manager Roles:** ${formatRoles(section.managerRoleIds)}`,
      `**Required Roles:** ${formatRoles(section.requiredRoleIds)}`,
      `**Multiple Entries:** ${section.allowMultipleEntries ? 'Yes ✅' : 'No ❌'}`,
      `**Require Role:** ${section.requireRole ? 'Yes ✅' : 'No ❌'}`,
      `**Ping Winners:** ${section.pingWinners !== false ? 'Yes ✅' : 'No ❌'}`, '',
      `Active: \`${active}\` | Created: \`${section.analytics.created}\` | Ended: \`${section.analytics.ended}\` | Entries: \`${section.analytics.entries}\``,
    ].join('\n')).setFooter({ text: `Requested by ${memberDisplayName}` }).setTimestamp();
  return { embeds: [embed], components: [
    row(new ChannelSelectMenuBuilder().setCustomId('admin:giveaways:announcementChannel').setPlaceholder('Announcement channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)),
    row(new ChannelSelectMenuBuilder().setCustomId('admin:giveaways:logChannel').setPlaceholder('Log channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)),
    row(new RoleSelectMenuBuilder().setCustomId('admin:giveaways:managerRoles').setPlaceholder('Manager roles').setMinValues(0).setMaxValues(10)),
    row(button('admin:giveaways:deployTest', '🚀 Deploy Test Giveaway', ButtonStyle.Success), button(section.enabled !== false ? 'admin:giveaways:disable' : 'admin:giveaways:enable', section.enabled !== false ? '⏸️ Disable' : '▶️ Enable', ButtonStyle.Secondary), button('admin:giveaways:toggleMultiple', '🎟️ Multiple', ButtonStyle.Secondary), button('admin:giveaways:toggleRequireRole', '🔒 Role Req', ButtonStyle.Secondary), button('admin:giveaways:togglePing', '📣 Ping', ButtonStyle.Secondary)),
    row(button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary)),
  ] };
}

module.exports = { buildGiveawaysAdminPanel };