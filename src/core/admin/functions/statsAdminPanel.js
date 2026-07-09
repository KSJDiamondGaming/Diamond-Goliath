'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const statsStore = require('../../../modules/stats/statsStore');
const statsCounters = require('../../../modules/stats/statsCounters');

const PANEL_COLOR = '#5865F2';

function button(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function getMemberDisplayName(interaction) {
  return (
    interaction.member?.displayName ||
    interaction.user?.displayName ||
    interaction.user?.username ||
    'Unknown User'
  );
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-GB');
}

function formatCounterList(counters = []) {
  if (!counters.length) return 'No counter channels configured yet.';

  return counters
    .map((counter, index) => {
      const template = counter.template || statsCounters.defaultTemplate(counter.type);
      return `**${index + 1}.** <#${counter.channelId}> — \`${counter.type}\` — \`${template}\``;
    })
    .join('\n')
    .slice(0, 1024);
}

function buildStatsAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const summary = statsStore.getSummary(guild.id);
  const counters = statsCounters.listCounters(guild.id);

  const embed = new EmbedBuilder()
    .setColor(summary.enabled ? 0x57f287 : PANEL_COLOR)
    .setTitle('📊 Server Stats')
    .setDescription([
      'Configure Statbot-style counter channels and server activity tracking from the Admin Menu.',
      '',
      `**Tracking:** ${summary.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Counters:** \`${counters.length}\` configured`,
    ].join('\n'))
    .addFields(
      {
        name: 'Overview',
        value: [
          `Messages: \`${formatNumber(summary.totals.messages)}\``,
          `Voice Minutes: \`${formatNumber(summary.totals.voiceMinutes)}\``,
          `Joins: \`${formatNumber(summary.totals.joins)}\``,
          `Leaves: \`${formatNumber(summary.totals.leaves)}\``,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Counter Channels',
        value: formatCounterList(counters),
        inline: false,
      }
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        button('admin:stats:setup', '⚡ Setup Counters', ButtonStyle.Success),
        button('admin:stats:refresh', '🔄 Refresh', ButtonStyle.Primary),
        button(summary.enabled ? 'admin:stats:disable' : 'admin:stats:enable', summary.enabled ? '⏸️ Disable' : '▶️ Enable', summary.enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
      ),
      row(
        button('admin:stats:view', '📊 View Overview', ButtonStyle.Primary),
        button('admin:stats:counters', '📋 List Counters', ButtonStyle.Secondary),
        button('admin:modules', '⬅️ Back to Modules', ButtonStyle.Secondary)
      ),
    ],
  };
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return true;
  }

  await interaction.update(payload);
  return true;
}

async function handleStatsAdminInteraction(interaction) {
  if (!interaction?.isButton?.()) return false;
  if (!String(interaction.customId || '').startsWith('admin:stats')) return false;

  const memberDisplayName = getMemberDisplayName(interaction);

  if (interaction.customId === 'admin:stats') {
    return safeUpdate(interaction, buildStatsAdminPanel(interaction.guild, memberDisplayName));
  }

  if (interaction.customId === 'admin:stats:setup') {
    await interaction.deferUpdate().catch(() => null);
    statsStore.setEnabled(interaction.guild.id, true, interaction.guild);
    await statsCounters.createCounterSuite(interaction.guild);
    return safeUpdate(interaction, buildStatsAdminPanel(interaction.guild, memberDisplayName));
  }

  if (interaction.customId === 'admin:stats:refresh') {
    await interaction.deferUpdate().catch(() => null);
    await statsCounters.refreshCounters(interaction.guild);
    return safeUpdate(interaction, buildStatsAdminPanel(interaction.guild, memberDisplayName));
  }

  if (interaction.customId === 'admin:stats:enable') {
    statsStore.setEnabled(interaction.guild.id, true, interaction.guild);
    return safeUpdate(interaction, buildStatsAdminPanel(interaction.guild, memberDisplayName));
  }

  if (interaction.customId === 'admin:stats:disable') {
    statsStore.setEnabled(interaction.guild.id, false, interaction.guild);
    return safeUpdate(interaction, buildStatsAdminPanel(interaction.guild, memberDisplayName));
  }

  if (interaction.customId === 'admin:stats:view' || interaction.customId === 'admin:stats:counters') {
    return safeUpdate(interaction, buildStatsAdminPanel(interaction.guild, memberDisplayName));
  }

  return false;
}

module.exports = {
  buildStatsAdminPanel,
  handleStatsAdminInteraction,
};
