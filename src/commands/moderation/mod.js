const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { createPanelEmbed } = require('../../utils/embed/embedStyle');

function buildMainEmbed(interaction) {
  return createPanelEmbed(interaction, {
    title: '🛡️ Moderation Panel',
    description:
      'Use the buttons below to browse moderation tools for this server.',
    thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
  }).addFields(
    {
      name: '⚡ Quick Actions',
      value:
        '`/warn` • `/ban` • `/kick` • `/timeout`\n' +
        '`/tempmute` • `/tempban` • `/clearwarnings`',
      inline: false,
    },
    {
      name: '📁 Case Tools',
      value:
        '`/case view` • `/case list`\n' +
        '`/case search-user` • `/case search-action`',
      inline: false,
    },
    {
      name: '📜 Warning Tools',
      value:
        '`/warnings` • `/clearwarnings`\n' +
        'Warning history and warning cleanup',
      inline: false,
    },
    {
      name: '📊 Stats',
      value:
        '`/modstats`\n' +
        'Server-wide moderation totals and recent activity',
      inline: false,
    }
  );
}

function buildActionsEmbed(interaction) {
  return createPanelEmbed(interaction, {
    title: '⚡ Moderation Actions',
    description: 'These are your main staff action commands.',
    thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
  }).addFields(
    {
      name: '⚠️ Warning',
      value:
        '`/warn user:<member> reason:<text> evidence:<optional>`\n' +
        'Adds a warning case and logs it.',
      inline: false,
    },
    {
      name: '🔨 Removal Actions',
      value:
        '`/ban target:<member>`\n' +
        '`/kick target:<member>`',
      inline: false,
    },
    {
      name: '⏱️ Time-based Actions',
      value:
        '`/timeout target:<member> minutes:<time>`\n' +
        '`/tempmute user:<member> duration:<minutes>`\n' +
        '`/tempban user:<member> duration:<minutes>`',
      inline: false,
    },
    {
      name: '🧹 Cleanup',
      value:
        '`/clearwarnings target:<member>`\n' +
        'Clear one warning case or all active warnings.',
      inline: false,
    }
  );
}

function buildCasesEmbed(interaction) {
  return createPanelEmbed(interaction, {
    title: '📁 Case Tools',
    description: 'Browse and manage moderation case history.',
    thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
  }).addFields(
    {
      name: '🔎 View Cases',
      value:
        '`/case view number:<id>`\n' +
        '`/case list`',
      inline: false,
    },
    {
      name: '👤 Search Cases',
      value:
        '`/case search-user target:<member>`\n' +
        '`/case search-action action:<type>`',
      inline: false,
    },
    {
      name: '🗒️ Notes',
      value:
        '`/case note number:<id> text:<note>`\n' +
        '`/case delete-note number:<id> note:<note-number>`',
      inline: false,
    },
    {
      name: '✨ Tip',
      value:
        'Use paginated case views to browse quickly, then open a specific case from the list.',
      inline: false,
    }
  );
}

function buildWarningsEmbed(interaction) {
  return createPanelEmbed(interaction, {
    title: '📜 Warning Tools',
    description: 'Everything related to warnings and warning history.',
    thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
  }).addFields(
    {
      name: '📜 View Warnings',
      value:
        '`/warnings user:<member>`\n' +
        'Shows active and cleared warnings with pagination.',
      inline: false,
    },
    {
      name: '⚠️ Create Warning',
      value:
        '`/warn user:<member> reason:<text> evidence:<optional>`',
      inline: false,
    },
    {
      name: '🧹 Clear Warning History',
      value:
        '`/clearwarnings target:<member>`\n' +
        '`/clearwarnings target:<member> case:<id>`',
      inline: false,
    },
    {
      name: '📁 Case Sync',
      value:
        'Warnings are stored in your moderation case system, so `/warnings` and `/case` stay aligned.',
      inline: false,
    }
  );
}

function buildStatsEmbed(interaction) {
  return createPanelEmbed(interaction, {
    title: '📊 Moderation Stats',
    description: 'Server moderation overview tools.',
    thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
  }).addFields(
    {
      name: '📈 Main Stats Command',
      value:
        '`/modstats`\n' +
        'Shows totals, top moderators, and recent moderation activity.',
      inline: false,
    },
    {
      name: '🧠 Best Uses',
      value:
        'Track warning volume\n' +
        'See which actions are most common\n' +
        'Review recent case trends',
      inline: false,
    },
    {
      name: '🚀 Recommended Workflow',
      value:
        'Use `/modstats` for overview, `/case` for detail, and action commands for direct moderation.',
      inline: false,
    }
  );
}

function buildButtons(active) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mod_panel_home')
      .setLabel('Home')
      .setStyle(active === 'home' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mod_panel_actions')
      .setLabel('Actions')
      .setStyle(active === 'actions' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mod_panel_cases')
      .setLabel('Cases')
      .setStyle(active === 'cases' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mod_panel_warnings')
      .setLabel('Warnings')
      .setStyle(active === 'warnings' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mod_panel_stats')
      .setLabel('Stats')
      .setStyle(active === 'stats' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  return [row1];
}

function getPanelEmbed(interaction, page) {
  switch (page) {
    case 'actions':
      return buildActionsEmbed(interaction);
    case 'cases':
      return buildCasesEmbed(interaction);
    case 'warnings':
      return buildWarningsEmbed(interaction);
    case 'stats':
      return buildStatsEmbed(interaction);
    case 'home':
    default:
      return buildMainEmbed(interaction);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Open the moderation control panel')
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Open the moderation panel')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub !== 'panel') {
      return interaction.reply({
        content: '❌ Invalid moderation panel option.',
        ephemeral: true,
      });
    }

    let currentPage = 'home';

    const response = await interaction.reply({
      embeds: [getPanelEmbed(interaction, currentPage)],
      components: buildButtons(currentPage),
      ephemeral: true,
      fetchReply: true,
    });

    const collector = response.createMessageComponentCollector({
      time: 180000,
    });

    collector.on('collect', async (buttonInteraction) => {
      if (buttonInteraction.user.id !== interaction.user.id) {
        return buttonInteraction.reply({
          content: '❌ You cannot use this moderation panel.',
          ephemeral: true,
        });
      }

      if (buttonInteraction.customId === 'mod_panel_home') {
        currentPage = 'home';
      } else if (buttonInteraction.customId === 'mod_panel_actions') {
        currentPage = 'actions';
      } else if (buttonInteraction.customId === 'mod_panel_cases') {
        currentPage = 'cases';
      } else if (buttonInteraction.customId === 'mod_panel_warnings') {
        currentPage = 'warnings';
      } else if (buttonInteraction.customId === 'mod_panel_stats') {
        currentPage = 'stats';
      }

      await buttonInteraction.update({
        embeds: [getPanelEmbed(interaction, currentPage)],
        components: buildButtons(currentPage),
      });
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({
          components: [],
        });
      } catch (error) {
        // Ignore edit errors
      }
    });
  },
};