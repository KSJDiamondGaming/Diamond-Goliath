'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

const statsStore = require('../../modules/stats/statsStore');
const statsCounters = require('../../modules/stats/statsCounters');
const { enforceCommandAccess } = require('../../core/ui/commandAccess');

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-GB');
}

function formatTop(items = [], mentionType = 'user') {
  if (!items.length) return 'No data yet.';

  return items
    .map((item, index) => {
      const target = mentionType === 'channel' ? `<#${item.id}>` : `<@${item.id}>`;
      return `**${index + 1}.** ${target} — \`${formatNumber(item.value)}\``;
    })
    .join('\n')
    .slice(0, 1024);
}

function buildStatsEmbed(interaction) {
  const summary = statsStore.getSummary(interaction.guild.id);

  return new EmbedBuilder()
    .setColor(summary.enabled ? 0x57f287 : 0xed4245)
    .setTitle('📊 Goliath Server Stats')
    .setDescription(summary.enabled ? 'Stats tracking is enabled.' : 'Stats tracking is disabled.')
    .addFields(
      {
        name: 'Totals',
        value: [
          `Messages: \`${formatNumber(summary.totals.messages)}\``,
          `Voice Minutes: \`${formatNumber(summary.totals.voiceMinutes)}\``,
          `Joins: \`${formatNumber(summary.totals.joins)}\``,
          `Leaves: \`${formatNumber(summary.totals.leaves)}\``,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Top Message Users',
        value: formatTop(summary.top.messageUsers, 'user'),
        inline: false,
      },
      {
        name: 'Top Message Channels',
        value: formatTop(summary.top.messageChannels, 'channel'),
        inline: false,
      },
      {
        name: 'Top Voice Users',
        value: formatTop(summary.top.voiceUsers, 'user'),
        inline: false,
      }
    )
    .setFooter({
      text: `Requested by ${interaction.member?.displayName || interaction.user.username}`,
    })
    .setTimestamp(new Date());
}

async function safeReply(interaction, payload) {
  const safePayload = {
    ...payload,
    flags: 64,
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(safePayload);
  }

  return interaction.reply(safePayload);
}

module.exports = {
  category: 'Admin',

  help: {
    name: 'stats',
    description: 'Setup, view, reset, or manage Goliath server stats.',
    usage: '/stats setup | /stats enable | /stats disable | /stats view | /stats reset | /stats counters | /stats export',
  },

  access: {
    ownerOnly: false,
    permissions: [PermissionFlagsBits.ManageGuild],
  },

  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Setup view reset or manage Goliath server stats')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Create the default stats setup for this server')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('enable')
        .setDescription('Enable stats tracking')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Disable stats tracking')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view')
        .setDescription('View tracked server stats')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Reset all tracked stats data')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('counters')
        .setDescription('List configured stats counter channels')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('export')
        .setDescription('Export a compact stats summary')
    ),

  async execute(interaction) {
    const denied = await enforceCommandAccess(interaction, module.exports);
    if (denied) return;

    const action = interaction.options.getSubcommand(false) || 'view';

    if (action === 'setup') {
      statsStore.setEnabled(interaction.guild.id, true, interaction.guild);
      return safeReply(interaction, {
        content: '✅ Stats module setup complete. Message, voice, and member tracking are now enabled.',
      });
    }

    if (action === 'enable') {
      statsStore.setEnabled(interaction.guild.id, true, interaction.guild);
      return safeReply(interaction, {
        content: '✅ Stats tracking enabled.',
      });
    }

    if (action === 'disable') {
      statsStore.setEnabled(interaction.guild.id, false, interaction.guild);
      return safeReply(interaction, {
        content: '✅ Stats tracking disabled.',
      });
    }

    if (action === 'reset') {
      statsStore.resetStats(interaction.guild.id, interaction.guild);
      return safeReply(interaction, {
        content: '✅ Stats data reset. The module is now back to default disabled state.',
      });
    }

    if (action === 'counters') {
      const counters = statsCounters.listCounters(interaction.guild.id);
      const text = counters.length
        ? counters
            .map((counter, index) => `**${index + 1}.** <#${counter.channelId}> — \`${counter.type}\` — \`${counter.template}\``)
            .join('\n')
        : 'No stats counters configured yet.';

      return safeReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('📊 Stats Counters')
            .setDescription(text)
            .setTimestamp(),
        ],
      });
    }

    if (action === 'export') {
      const summary = statsStore.getSummary(interaction.guild.id);
      return safeReply(interaction, {
        content: '```json\n' + JSON.stringify(summary, null, 2).slice(0, 1800) + '\n```',
      });
    }

    return safeReply(interaction, {
      embeds: [buildStatsEmbed(interaction)],
    });
  },
};