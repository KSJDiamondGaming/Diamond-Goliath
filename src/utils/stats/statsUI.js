const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');

const stats = require('./statsManager');

function buildStatsSetupEmbed(guild) {
  const config = stats.getGuildConfig(guild.id);
  const selectedStat = stats.getSelectedStat(guild.id);
  const configuredStats = stats.getConfiguredStats(guild.id);

  const selectedLabel =
    stats.STAT_DEFINITIONS[selectedStat]?.label || 'Unknown';

  const configuredText = configuredStats.length
    ? configuredStats
        .map((key) => `• ${stats.STAT_DEFINITIONS[key]?.label || key}`)
        .join('\n')
    : 'None yet';

  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('📊 Diamond Goliath Stats Setup')
    .setDescription('Configure your server stat channels one at a time.')
    .addFields(
      {
        name: 'Category',
        value: config.categoryId ? 'Created' : 'Not created',
        inline: true,
      },
      {
        name: 'Selected Stat',
        value: selectedLabel,
        inline: true,
      },
      {
        name: 'Channel Type',
        value: 'Text',
        inline: true,
      },
      {
        name: 'Configured Stats',
        value: configuredText,
      }
    );
}

function buildStatSelectMenu(guildId) {
  const selectedStat = stats.getSelectedStat(guildId);

  return new StringSelectMenuBuilder()
    .setCustomId('stats_select_stat')
    .setPlaceholder('Choose a stat to manage')
    .addOptions(
      Object.values(stats.STAT_DEFINITIONS).map((stat) => ({
        label: stat.label,
        value: stat.key,
        default: stat.key === selectedStat,
      }))
    );
}

function buildStatsSetupComponents(guild) {
  const selectRow = new ActionRowBuilder().addComponents(
    buildStatSelectMenu(guild.id)
  );

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('stats_create_category')
      .setLabel('Create Category')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('stats_create_selected')
      .setLabel('Create Selected')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('stats_update_all')
      .setLabel('Update All')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('stats_remove_selected')
      .setLabel('Remove Selected')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('stats_remove_all')
      .setLabel('Remove All')
      .setStyle(ButtonStyle.Danger)
  );

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('stats_close_menu')
      .setLabel('Close')
      .setStyle(ButtonStyle.Secondary)
  );

  return [selectRow, buttonRow, closeRow];
}

function buildStatsSetupMessage(guild) {
  return {
    embeds: [buildStatsSetupEmbed(guild)],
    components: buildStatsSetupComponents(guild),
    flags: MessageFlags.Ephemeral,
  };
}

function isStatsInteraction(interaction) {
  if (!interaction.guild) return false;

  return [
    'stats_select_stat',
    'stats_create_category',
    'stats_create_selected',
    'stats_update_all',
    'stats_remove_selected',
    'stats_remove_all',
    'stats_close_menu',
  ].includes(interaction.customId);
}

async function refreshPanel(interaction, statusMessage) {
  return interaction.update({
    content: statusMessage || null,
    embeds: [buildStatsSetupEmbed(interaction.guild)],
    components: buildStatsSetupComponents(interaction.guild),
  });
}

async function handleStatsInteraction(interaction) {
  if (!isStatsInteraction(interaction)) return false;

  try {
    if (interaction.isStringSelectMenu()) {
      const selected = interaction.values[0];
      stats.setSelectedStat(interaction.guild.id, selected);

      await refreshPanel(
        interaction,
        `Selected stat: ${stats.STAT_DEFINITIONS[selected]?.label || selected}`
      );

      return true;
    }

    if (interaction.isButton()) {
      const selectedStat = stats.getSelectedStat(interaction.guild.id);
      let result = { ok: false, msg: 'Unknown stats action.' };

      switch (interaction.customId) {
        case 'stats_create_category':
          result = await stats.createStatsCategory(interaction.guild);
          await refreshPanel(interaction, result.msg);
          return true;

        case 'stats_create_selected':
          result = await stats.createStatChannel(interaction.guild, selectedStat);
          await refreshPanel(interaction, result.msg);
          return true;

        case 'stats_update_all':
          result = await stats.updateAllStatChannels(interaction.guild);
          await refreshPanel(interaction, result.msg);
          return true;

        case 'stats_remove_selected':
          result = await stats.removeSingleStatChannel(interaction.guild, selectedStat);
          await refreshPanel(interaction, result.msg);
          return true;

        case 'stats_remove_all':
          result = await stats.removeAllStatChannels(interaction.guild);
          await refreshPanel(interaction, result.msg);
          return true;

        case 'stats_close_menu':
          await interaction.update({
            content: 'Stats setup menu closed.',
            embeds: [],
            components: [],
          });
          return true;

        default:
          return false;
      }
    }
  } catch (error) {
    console.error('Stats interaction handler error:', error);

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: 'There was an error handling the stats menu.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    } else {
      await interaction.reply({
        content: 'There was an error handling the stats menu.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }

    return true;
  }

  return false;
}

module.exports = {
  buildStatsSetupEmbed,
  buildStatsSetupComponents,
  buildStatsSetupMessage,
  isStatsInteraction,
  handleStatsInteraction,
};