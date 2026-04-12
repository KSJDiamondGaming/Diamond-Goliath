const stats = require('./statsManager');
const {
  buildStatsSetupEmbed,
  buildStatsSetupComponents,
  buildStatsSetupMessage,
} = require('./statsPanel');

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
  isStatsInteraction,
  handleStatsInteraction,
  buildStatsSetupMessage,
};