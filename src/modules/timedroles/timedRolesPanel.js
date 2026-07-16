'use strict';

const { EmbedBuilder } = require('discord.js');
const timedRoles = require('./timedRoles');

function formatDuration(rule) {
  const value = Number(rule.value || 1);
  const unit = String(rule.unit || 'days');
  return `${value} ${value === 1 ? unit.replace(/s$/, '') : unit}`;
}

function buildOverview(guildId) {
  const section = timedRoles.getSection(guildId);
  const rules = timedRoles.listRules(guildId);
  const lines = rules.length
    ? rules.map((rule) => `${rule.enabled ? '✅' : '⏸️'} <@&${rule.roleId}> after **${formatDuration(rule)}**${rule.removeRoleIds.length ? ` · removes ${rule.removeRoleIds.map((id) => `<@&${id}>`).join(', ')}` : ''}`)
    : ['No timed role milestones are configured.'];

  return {
    embeds: [new EmbedBuilder()
      .setColor(section.enabled === false ? 0xED4245 : 0x5865F2)
      .setTitle('Timed Roles')
      .setDescription([
        'Award roles automatically based on how long a member has been in the server.',
        '',
        ...lines,
      ].join('\n'))
      .addFields(
        { name: 'Status', value: section.enabled === false ? 'Disabled' : 'Enabled', inline: true },
        { name: 'Milestones', value: String(rules.length), inline: true },
        { name: 'Last scan', value: section.analytics.lastScanAt ? `<t:${Math.floor(new Date(section.analytics.lastScanAt).getTime() / 1000)}:R>` : 'Never', inline: true },
      )
      .setFooter({ text: 'Use the dashboard or Timed Roles admin controls to configure milestones.' })],
  };
}

module.exports = { buildOverview, formatDuration };
