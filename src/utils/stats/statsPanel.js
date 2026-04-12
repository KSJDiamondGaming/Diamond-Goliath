const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
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

module.exports = {
  buildStatsSetupEmbed,
  buildStatsSetupComponents,
  buildStatsSetupMessage,
};