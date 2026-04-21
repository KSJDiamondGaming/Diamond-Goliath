const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const {
  canAccessCommand,
  enforceCommandAccess,
} = require('../../utils/utility/commandAccess');

const BOT_OWNER_ID = process.env.BOT_OWNER_ID || 'YOUR_USER_ID_HERE';

const CATEGORY_META = {
  Utility: {
    emoji: '🧰',
    description: 'General useful commands for everyone.',
  },
  Moderation: {
    emoji: '🛡️',
    description: 'Moderation tools for staff members.',
  },
  Logging: {
    emoji: '📜',
    description: 'Logging and moderation log setup commands.',
  },
  Admin: {
    emoji: '⚙️',
    description: 'Administrative and server management commands.',
  },
  Stats: {
    emoji: '📊',
    description: 'Server stats and stat panel setup commands.',
  },
  Embeds: {
    emoji: '🎨',
    description: 'Embed and welcome message tools.',
  },
  Fun: {
    emoji: '🎉',
    description: 'Fun and community commands.',
  },
  Other: {
    emoji: '📁',
    description: 'Other available commands.',
  },
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

function getHelpState(interaction) {
  const visibleCommands = getVisibleCommands(interaction);
  return groupCommandsByCategory(visibleCommands);
}

function buildHomeEmbed(interaction, groupedCommands) {
  const categories = Object.keys(groupedCommands).sort((a, b) => a.localeCompare(b));
  const totalCommands = categories.reduce(
    (sum, category) => sum + groupedCommands[category].length,
    0
  );

  const categoryLines = categories.length
    ? categories
        .map((category) => {
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
        value: categoryLines,
      },
      {
        name: 'Visible Commands',
        value: `\`${totalCommands}\` command${totalCommands === 1 ? '' : 's'}`,
      }
    )
    .setFooter({
      text: `${interaction.client.user.username} • Only commands you can use are shown`,
    })
    .setTimestamp();
}

function buildCategoryEmbed(category, commands) {
  const meta = CATEGORY_META[category] || CATEGORY_META.Other;

  const commandList = commands.length
    ? commands
        .map((command) => `**/${command.data.name}** — ${getCommandDescription(command)}`)
        .join('\n')
    : 'No commands available in this category.';

  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`${meta.emoji} ${category} Commands`)
    .setDescription(meta.description)
    .addFields({
      name: `Available in ${category}`,
      value: commandList,
    })
    .setFooter({
      text: `${commands.length} command${commands.length === 1 ? '' : 's'} visible to you`,
    })
    .setTimestamp();
}

function buildComponents(groupedCommands, selectedCategory = null, disabled = false) {
  const categories = Object.keys(groupedCommands).sort((a, b) => a.localeCompare(b));

  const options = categories.length
    ? categories.map((category) => {
        const meta = CATEGORY_META[category] || CATEGORY_META.Other;
        const count = groupedCommands[category].length;

        return {
          label: category,
          description: `${count} command${count === 1 ? '' : 's'} available`,
          value: category,
          emoji: meta.emoji,
          default: selectedCategory === category,
        };
      })
    : [
        {
          label: 'Other',
          description: 'No commands available',
          value: 'Other',
          emoji: CATEGORY_META.Other.emoji,
          default: true,
        },
      ];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('help-category-select')
    .setPlaceholder('Choose a command category')
    .setDisabled(disabled || !categories.length)
    .addOptions(options);

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

async function handleHelpSelectMenu(interaction) {
  if (interaction.customId !== 'help-category-select') return false;

  const groupedCommands = getHelpState(interaction);
  const selectedCategory = interaction.values?.[0];

  if (!selectedCategory || !groupedCommands[selectedCategory]) {
    await interaction.reply({
      content: '⚠️ That help category is no longer available.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const commands = groupedCommands[selectedCategory] || [];

  await interaction.update({
    embeds: [buildCategoryEmbed(selectedCategory, commands)],
    components: buildComponents(groupedCommands, selectedCategory),
  });

  return true;
}

async function handleHelpButton(interaction) {
  if (interaction.customId === 'help-back-home') {
    const groupedCommands = getHelpState(interaction);

    await interaction.update({
      embeds: [buildHomeEmbed(interaction, groupedCommands)],
      components: buildComponents(groupedCommands),
    });

    return true;
  }

  if (interaction.customId === 'help-close') {
    await interaction.update({
      content: 'Help panel closed.',
      embeds: [],
      components: [],
    });

    return true;
  }

  return false;
}

module.exports = {
  category: 'Utility',
  help: {
    name: 'help',
    description: 'Browse bot commands by category based on your permissions.',
    usage: '/help',
  },
  access: {
    permissions: [],
    ownerOnly: false,
  },

  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Browse all commands available to you'),

  async execute(interaction) {
    const denied = await enforceCommandAccess(interaction, module.exports, BOT_OWNER_ID);
    if (denied) return;

    const groupedCommands = getHelpState(interaction);

    if (!Object.keys(groupedCommands).length) {
      return interaction.reply({
        content: 'I could not find any commands available to you.',
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      embeds: [buildHomeEmbed(interaction, groupedCommands)],
      components: buildComponents(groupedCommands),
      flags: MessageFlags.Ephemeral,
    });
  },

  handleHelpSelectMenu,
  handleHelpButton,
};