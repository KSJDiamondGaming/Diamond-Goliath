const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const {
  createSuccessEmbed,
  createDangerEmbed,
} = require('../../utils/embed/embedStyle');

const warningsPath = path.join(__dirname, '../../data/warnings.json');

function ensureWarningsFile() {
  const dir = path.dirname(warningsPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(warningsPath)) {
    fs.writeFileSync(warningsPath, JSON.stringify({}, null, 2));
  }
}

function getWarnings() {
  ensureWarningsFile();
  return JSON.parse(fs.readFileSync(warningsPath, 'utf8'));
}

function saveWarnings(data) {
  ensureWarningsFile();
  fs.writeFileSync(warningsPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to warn')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the warning')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason =
      interaction.options.getString('reason') || 'No reason provided';

    const member = await interaction.guild.members
      .fetch(target.id)
      .catch(() => null);

    if (!member) {
      const embed = createDangerEmbed(interaction, {
        title: '❌ Member Not Found',
        description: 'That member is not in this server.',
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (target.bot) {
      const embed = createDangerEmbed(interaction, {
        title: '❌ Invalid Target',
        description: 'You cannot warn a bot.',
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (target.id === interaction.user.id) {
      const embed = createDangerEmbed(interaction, {
        title: '❌ Invalid Target',
        description: 'You cannot warn yourself.',
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (target.id === interaction.client.user.id) {
      const embed = createDangerEmbed(interaction, {
        title: '❌ Invalid Target',
        description: 'You cannot warn this bot.',
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.member.roles.highest.position <= member.roles.highest.position) {
      const embed = createDangerEmbed(interaction, {
        title: '❌ Action Failed',
        description: 'You cannot warn a member with the same or higher role.',
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const warningsData = getWarnings();

    if (!warningsData[target.id]) {
      warningsData[target.id] = [];
    }

    const warningEntry = {
      reason,
      moderator: interaction.user.id,
      timestamp: Date.now(),
    };

    warningsData[target.id].push(warningEntry);
    saveWarnings(warningsData);

    const totalWarnings = warningsData[target.id].length;

    const embed = createSuccessEmbed(interaction, {
      title: '⚠️ Member Warned',
      description: `${target} has been warned successfully.`,
      thumbnail: target.displayAvatarURL({ dynamic: true }),
    }).addFields(
      {
        name: '👤 Member',
        value: `${target}`,
        inline: true,
      },
      {
        name: '👮 Moderator',
        value: `${interaction.user}`,
        inline: true,
      },
      {
        name: '📊 Total Warnings',
        value: `${totalWarnings}`,
        inline: true,
      },
      {
        name: '📝 Reason',
        value: reason,
        inline: false,
      }
    );

    await interaction.reply({ embeds: [embed] });

    try {
      const dmEmbed = createSuccessEmbed(interaction, {
        title: `⚠️ You were warned in ${interaction.guild.name}`,
        description: 'A moderator has issued you a warning.',
        thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
        footerText: interaction.guild.name,
      }).addFields({
        name: '📝 Reason',
        value: reason,
        inline: false,
      });

      await target.send({ embeds: [dmEmbed] });
    } catch (error) {
      // Ignore DM failures
    }
  },
};