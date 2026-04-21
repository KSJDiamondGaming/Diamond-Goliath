const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');

const {
  canAccessCommand,
  enforceCommandAccess
} = require('../../utils/utility/commandAccess');

const BOT_OWNER_ID = process.env.BOT_OWNER_ID || 'YOUR_USER_ID_HERE';

const CATEGORY_META = {
  Utility: {
    emoji: '🧰',
    description: 'General useful commands for everyone.'
  },
  Moderation: {
    emoji: '🛡️',
    description: 'Moderation tools for staff members.'
  },
  Logging: {
    emoji: '📜',
    description: 'Logging and moderation log setup commands.'
  },
  Admin: {
    emoji: '⚙️',
    description: 'Administrative and server management commands.'
  },
  Stats: {
    emoji: '📊',
    description: 'Server stats and stat panel setup commands.'
  },
  Embeds: {
    emoji: '🎨',
    description: 'Embed and welcome message tools.'
  },
  Fun: {
    emoji: '🎉',
    description: 'Fun and community commands.'
  },
  Other: {
    emoji: '📁',
    description: 'Other available commands.'
  }
};

function normalizeCategory(category) {
  if (!category || typeof category !== 'string') return 'Other';
  const trimmed = category.trim();
  return CATEGORY_META[trimmed] ? trimmed : trimmed || 'Other';
}

function getVisibleCommands(interaction) {
  const visibleCommands = [];

  for (const command of interaction.client.commands.values()) {
    if (!command?.data?.name) continue;
    if (!canAccessCommand(interaction, command, BOT_OWNER_ID)) continue;
    visibleCommands.push(command);
  }

  return visibleCommands.sort((a, b) => a.data.name.localeCompare(b.data.name));
}

function groupCommandsByCategory(commands) {
  const grouped = {};

  for (const command of commands) {
    const category = normalizeCategory(command.category);

    if (!grouped[category]) {
      grouped[category] = [];
    }

    grouped[category].push(command);
  }

  for (const category of Object.keys(grouped)) {
    grouped[category].sort((a, b) => a.data.name.localeCompare(b.data.name));
  }

  return grouped;
}

function getCommandDescription(command) {
  return (
    command.help?.description ||
    command.data?.description ||
    'No description provided.'
  );
}

function buildHomeEmbed(interaction, groupedCommands) {
  const categories = Object.keys(groupedCommands).sort((a, b) => a.localeCompare(b));
  const totalCommands = categories.reduce(
    (sum, category) => sum + groupedCommands[category].length,
    0
  );

  const categoryLines = categories.length
    ? categories
        .map(category => {
          const meta = CATEGORY_META[category] || CATEGORY_META.Other;
          const count = groupedCommands[category].length;
          return `${meta.emoji} **${category}** • ${count} command${count === 1 ? '' : 's'}`;
        })
        .join('\n')
    : 'No categories available.';

  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('📘 Help Menu')
    .setDescription('Browse the commands available to **your Discord permissions**.')
    .setThumbnail(interaction.client.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: 'Categories',
        value: categoryLines
      },
      {
        name: 'Visible Commands',
        value: `\`${totalCommands}\` command${totalCommands === 1 ? '' : 's'}`
      }
    )
    .setFooter({
      text: `${interaction.client.user.username} • Only commands you can use are shown`
    })
    .setTimestamp();
}

function buildCategoryEmbed(category, commands) {
  const meta = CATEGORY_META[category] || CATEGORY_META.Other;

  const commandList = commands.length
    ? commands
        .map(command => `**/${command.data.name}** — ${getCommandDescription(command)}`)
        .join('\n')
    : 'No commands available in this category.';

  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`${meta.emoji} ${category} Commands`)
    .setDescription(meta.description)
    .addFields({
      name: `Available in ${category}`,
      value: commandList
    })
    .setFooter({
      text: `${commands.length} command${commands.length === 1 ? '' : 's'} visible to you`
    })
    .setTimestamp();
}

function buildComponents(groupedCommands, selectedCategory = null, disabled = false) {
  const categories = Object.keys(groupedCommands).sort((a, b) => a.localeCompare(b));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('help-category-select')
    .setPlaceholder('Choose a command category')
    .setDisabled(disabled)
    .addOptions(
      categories.map(category => {
        const meta = CATEGORY_META[category] || CATEGORY_META.Other;
        const count = groupedCommands[category].length;

        return {
          label: category,
          description: `${count} command${count === 1 ? '' : 's'} available`,
          value: category,
          emoji: meta.emoji,
          default: selectedCategory === category
        };
      })
    );

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);

  const backButton = new ButtonBuilder()
    .setCustomId('help-back-home')
    .setLabel('Back Home')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || !selectedCategory);

  const closeButton = new ButtonBuilder()
    .setCustomId('help-close')
    .setLabel('Close')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(disabled);

  const buttonRow = new ActionRowBuilder().addComponents(backButton, closeButton);

  return [selectRow, buttonRow];
}

module.exports = {
  category: 'Utility',
  help: {
    name: 'help',
    description: 'Browse bot commands by category based on your permissions.',
    usage: '/help'
  },
  access: {
    permissions: [],
    ownerOnly: false
  },

  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Browse all commands available to you'),

  async execute(interaction) {
    const denied = await enforceCommandAccess(interaction, module.exports, BOT_OWNER_ID);
    if (denied) return;

    const visibleCommands = getVisibleCommands(interaction);
    const groupedCommands = groupCommandsByCategory(visibleCommands);

    if (!Object.keys(groupedCommands).length) {
      return interaction.reply({
        content: 'I could not find any commands available to you.',
        ephemeral: true
      });
    }

    const homeEmbed = buildHomeEmbed(interaction, groupedCommands);
    const homeComponents = buildComponents(groupedCommands);

    const message = await interaction.reply({
      embeds: [homeEmbed],
      components: homeComponents,
      ephemeral: true,
      fetchReply: true
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.MessageComponent,
      time: 120000
    });

    collector.on('collect', async componentInteraction => {
      if (componentInteraction.user.id !== interaction.user.id) {
        return componentInteraction.reply({
          content: 'This help panel is not for you.',
          ephemeral: true
        });
      }

      if (componentInteraction.isStringSelectMenu()) {
        const selectedCategory = componentInteraction.values[0];
        const commands = groupedCommands[selectedCategory] || [];

        return componentInteraction.update({
          embeds: [buildCategoryEmbed(selectedCategory, commands)],
          components: buildComponents(groupedCommands, selectedCategory)
        });
      }

      if (componentInteraction.isButton()) {
        if (componentInteraction.customId === 'help-back-home') {
          return componentInteraction.update({
            embeds: [buildHomeEmbed(interaction, groupedCommands)],
            components: buildComponents(groupedCommands)
          });
        }

        if (componentInteraction.customId === 'help-close') {
          collector.stop('closed');

          return componentInteraction.update({
            content: 'Help panel closed.',
            embeds: [],
            components: []
          });
        }
      }
    });

    collector.on('end', async (_, reason) => {
      if (reason === 'closed') return;

      try {
        await interaction.editReply({
          components: buildComponents(groupedCommands, null, true)
        });
      } catch (error) {
        // Ignore message edit failures after timeout/deletion
      }
    });
  }
};