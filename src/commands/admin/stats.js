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

function counterChoices(option) {
  return option
    .setName('type')
    .setDescription('Counter type')
    .setRequired(true)
    .addChoices(
      { name: 'Members', value: 'members' },
      { name: 'Humans / Gems', value: 'humans' },
      { name: 'Discord Services / Bots', value: 'bots' },
      { name: 'Messages', value: 'messages' },
      { name: 'Voice Minutes', value: 'voice' },
      { name: 'Channels', value: 'channels' },
      { name: 'Roles', value: 'roles' },
      { name: 'Date', value: 'date' }
    );
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
    usage: '/stats setup | /stats setup-channels | /stats refresh-counters | /stats counters',
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
        .setDescription('Enable stats tracking for this server')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup-channels')
        .setDescription('Create Statbot-style server stat counter channels')
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
        .setName('refresh-counters')
        .setDescription('Refresh all configured stat counter channel names')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add-counter')
        .setDescription('Register an existing channel as a stat counter')
        .addStringOption(counterChoices)
        .addStringOption((option) =>
          option
            .setName('channel_id')
            .setDescription('Channel ID to rename as a counter')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('template')
            .setDescription('Name template. Use {count} or {date}')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove-counter')
        .setDescription('Remove a stat counter channel from tracking')
        .addStringOption((option) =>
          option
            .setName('channel_id')
            .setDescription('Counter channel ID to remove')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('export')
        .setDescription('Export a compact stats summary')
    ),

  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: 64 }).catch(() => null);
    }

    const denied = await enforceCommandAccess(interaction, module.exports);
    if (denied) return;

    const action = interaction.options.getSubcommand(false) || 'view';

    if (action === 'setup') {
      statsStore.setEnabled(interaction.guild.id, true, interaction.guild);
      return safeReply(interaction, {
        content: '✅ Stats tracking enabled. Use `/stats setup-channels` to create Statbot-style counter channels.',
      });
    }

    if (action === 'setup-channels') {
      statsStore.setEnabled(interaction.guild.id, true, interaction.guild);
      const result = await statsCounters.createCounterSuite(interaction.guild);
      return safeReply(interaction, {
        content: [
          '✅ Stat counter channels created.',
          `Category: <#${result.categoryId}>`,
          '',
          ...result.created.map((counter) => `• <#${counter.channelId}> — \`${counter.name}\``),
        ].join('\n'),
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
        : 'No stats counters configured yet. Use `/stats setup-channels`.';

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

    if (action === 'refresh-counters') {
      const refreshed = await statsCounters.refreshCounters(interaction.guild);
      return safeReply(interaction, {
        content: refreshed.length
          ? ['✅ Refreshed stat counter channels.', '', ...refreshed.map((counter) => `• <#${counter.channelId}> — \`${counter.name}\``)].join('\n')
          : 'No stat counter channels are configured yet. Use `/stats setup-channels`.',
      });
    }

    if (action === 'add-counter') {
      const type = interaction.options.getString('type', true);
      const channelId = interaction.options.getString('channel_id', true);
      const template = interaction.options.getString('template', false) || statsCounters.defaultTemplate(type);
      statsCounters.addCounter(interaction.guild.id, { type, channelId, template }, interaction.guild);
      const refreshed = await statsCounters.refreshCounters(interaction.guild);
      return safeReply(interaction, {
        content: `✅ Counter registered for <#${channelId}> using \`${template}\`. Refreshed ${refreshed.length} counter(s).`,
      });
    }

    if (action === 'remove-counter') {
      const channelId = interaction.options.getString('channel_id', true);
      statsCounters.removeCounter(interaction.guild.id, channelId, interaction.guild);
      return safeReply(interaction, {
        content: `✅ Removed counter tracking for <#${channelId}>.`,
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
