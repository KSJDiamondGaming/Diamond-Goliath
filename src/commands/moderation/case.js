const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const {
  createPanelEmbed,
  createSuccessEmbed,
  createDangerEmbed,
} = require('../../utils/embed/embedStyle');

const caseDetailsPath = path.join(__dirname, '..', '..', 'data', 'modCaseDetails.json');

function ensureCaseFile() {
  const dir = path.dirname(caseDetailsPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(caseDetailsPath)) {
    fs.writeFileSync(caseDetailsPath, JSON.stringify({}, null, 2));
  }
}

function readJson() {
  ensureCaseFile();

  const raw = fs.readFileSync(caseDetailsPath, 'utf8');
  return raw ? JSON.parse(raw) : {};
}

function writeJson(data) {
  ensureCaseFile();
  fs.writeFileSync(caseDetailsPath, JSON.stringify(data, null, 2));
}

function trimText(text, max = 1024) {
  if (!text) return 'No reason provided';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Manage moderation cases')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)

    .addSubcommand(sub =>
      sub
        .setName('view')
        .setDescription('View a moderation case')
        .addIntegerOption(option =>
          option
            .setName('number')
            .setDescription('Case number')
            .setRequired(true)
            .setMinValue(1)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('note')
        .setDescription('Add a note to a moderation case')
        .addIntegerOption(option =>
          option
            .setName('number')
            .setDescription('Case number')
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption(option =>
          option
            .setName('text')
            .setDescription('Note text')
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('delete-note')
        .setDescription('Delete a note from a moderation case')
        .addIntegerOption(option =>
          option
            .setName('number')
            .setDescription('Case number')
            .setRequired(true)
            .setMinValue(1)
        )
        .addIntegerOption(option =>
          option
            .setName('note')
            .setDescription('Note number to delete')
            .setRequired(true)
            .setMinValue(1)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List recent moderation cases')
        .addIntegerOption(option =>
          option
            .setName('limit')
            .setDescription('How many recent cases to show')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(25)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('search-user')
        .setDescription('Search moderation cases for a user')
        .addUserOption(option =>
          option
            .setName('target')
            .setDescription('The user to search for')
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('search-action')
        .setDescription('Search moderation cases by action')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('The action to search for')
            .setRequired(true)
            .addChoices(
              { name: 'Warn', value: 'Warn' },
              { name: 'Ban', value: 'Ban' },
              { name: 'Kick', value: 'Kick' },
              { name: 'Timeout', value: 'Timeout' },
              { name: 'ClearWarnings', value: 'ClearWarnings' }
            )
        )
        .addIntegerOption(option =>
          option
            .setName('limit')
            .setDescription('How many cases to show')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(25)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    const data = readJson();
    const guildCases = data[interaction.guild.id] || {};
    const allCases = Object.values(guildCases);

    if (sub === 'view') {
      const caseNumber = interaction.options.getInteger('number');
      const caseData = guildCases[caseNumber];

      if (!caseData) {
        const embed = createDangerEmbed(interaction, {
          title: '❌ Case Not Found',
          description: `Case **#${caseNumber}** was not found.`,
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const embed = createPanelEmbed(interaction, {
        title: `📁 Case #${caseData.caseNumber}`,
        description: 'Moderation case details',
      }).addFields(
        {
          name: '📌 Action',
          value: caseData.action || 'Unknown',
          inline: true,
        },
        {
          name: '👤 Target',
          value: `${caseData.targetTag || 'Unknown'}\n\`${caseData.targetId || 'Unknown'}\``,
          inline: true,
        },
        {
          name: '🛡️ Moderator',
          value: `${caseData.moderatorTag || 'Unknown'}\n\`${caseData.moderatorId || 'Unknown'}\``,
          inline: true,
        },
        {
          name: '🕒 Created',
          value: caseData.createdAt
            ? `<t:${Math.floor(caseData.createdAt / 1000)}:F>`
            : 'Unknown',
          inline: false,
        },
        {
          name: '📝 Reason',
          value: trimText(caseData.reason || 'No reason provided'),
          inline: false,
        }
      );

      if (caseData.duration) {
        embed.addFields({
          name: '⏱️ Duration',
          value: `${caseData.duration}`,
          inline: true,
        });
      }

      if (caseData.evidence) {
        embed.addFields({
          name: '📎 Evidence',
          value: trimText(caseData.evidence),
          inline: false,
        });
      }

      if (caseData.cleared === true) {
        embed.addFields({
          name: '🧹 Cleared',
          value:
            `Yes\n` +
            `By ${caseData.clearedByTag || 'Unknown'}\n` +
            `${caseData.clearedAt ? `<t:${Math.floor(caseData.clearedAt / 1000)}:F>` : 'Unknown time'}`,
          inline: false,
        });

        if (caseData.clearReason) {
          embed.addFields({
            name: '📝 Clear Reason',
            value: trimText(caseData.clearReason),
            inline: false,
          });
        }
      }

      if (Array.isArray(caseData.notes) && caseData.notes.length > 0) {
        const notesText = caseData.notes
          .map((note, index) => {
            const when = note.createdAt
              ? `<t:${Math.floor(note.createdAt / 1000)}:R>`
              : 'Unknown time';

            return `**${index + 1}.** ${note.text}\n*By ${note.moderatorTag || 'Unknown'} • ${when}*`;
          })
          .join('\n\n');

        embed.addFields({
          name: '🗒️ Notes',
          value: trimText(notesText),
          inline: false,
        });
      }

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'note') {
      const caseNumber = interaction.options.getInteger('number');
      const text = interaction.options.getString('text');
      const caseData = guildCases[caseNumber];

      if (!caseData) {
        const embed = createDangerEmbed(interaction, {
          title: '❌ Case Not Found',
          description: `Case **#${caseNumber}** was not found.`,
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (!Array.isArray(caseData.notes)) {
        caseData.notes = [];
      }

      caseData.notes.push({
        text,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        createdAt: Date.now(),
      });

      writeJson(data);

      const embed = createSuccessEmbed(interaction, {
        title: '🗒️ Note Added',
        description: `Added a note to case **#${caseNumber}**.`,
      }).addFields({
        name: '📝 Note',
        value: trimText(text),
        inline: false,
      });

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'delete-note') {
      const caseNumber = interaction.options.getInteger('number');
      const noteNumber = interaction.options.getInteger('note');
      const caseData = guildCases[caseNumber];

      if (!caseData) {
        const embed = createDangerEmbed(interaction, {
          title: '❌ Case Not Found',
          description: `Case **#${caseNumber}** was not found.`,
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (!Array.isArray(caseData.notes) || caseData.notes.length === 0) {
        const embed = createDangerEmbed(interaction, {
          title: '❌ No Notes Found',
          description: `Case **#${caseNumber}** has no notes.`,
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (noteNumber < 1 || noteNumber > caseData.notes.length) {
        const embed = createDangerEmbed(interaction, {
          title: '❌ Note Not Found',
          description: `Note **#${noteNumber}** does not exist on case **#${caseNumber}**.`,
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      caseData.notes.splice(noteNumber - 1, 1);
      writeJson(data);

      const embed = createSuccessEmbed(interaction, {
        title: '🗑️ Note Deleted',
        description: `Deleted note **#${noteNumber}** from case **#${caseNumber}**.`,
      });

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'list') {
      const limit = interaction.options.getInteger('limit') || 10;

      const casesArray = allCases
        .sort((a, b) => b.caseNumber - a.caseNumber)
        .slice(0, limit);

      if (casesArray.length === 0) {
        const embed = createDangerEmbed(interaction, {
          title: '❌ No Cases Found',
          description: 'No moderation cases were found for this server.',
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const warnCount = allCases.filter(c => c.action === 'Warn').length;
      const banCount = allCases.filter(c => c.action === 'Ban').length;
      const kickCount = allCases.filter(c => c.action === 'Kick').length;
      const timeoutCount = allCases.filter(c => c.action === 'Timeout').length;
      const clearedCount = allCases.filter(c => c.cleared === true).length;

      const description = casesArray
        .map((c) => {
          const clearedTag = c.cleared === true ? ' • Cleared' : '';
          return `**#${c.caseNumber}** • ${c.action}${clearedTag} • ${c.targetTag}\n<t:${Math.floor(c.createdAt / 1000)}:R>`;
        })
        .join('\n\n');

      const embed = createPanelEmbed(interaction, {
        title: '📚 Recent Moderation Cases',
        description: trimText(description, 4096),
      }).addFields(
        { name: '⚠️ Warns', value: `${warnCount}`, inline: true },
        { name: '🔨 Bans', value: `${banCount}`, inline: true },
        { name: '👢 Kicks', value: `${kickCount}`, inline: true },
        { name: '⏱️ Timeouts', value: `${timeoutCount}`, inline: true },
        { name: '🧹 Cleared', value: `${clearedCount}`, inline: true },
        { name: '📦 Total Cases', value: `${allCases.length}`, inline: true }
      );

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'search-user') {
      const target = interaction.options.getUser('target');

      const matches = allCases
        .filter((c) => c.targetId === target.id)
        .sort((a, b) => b.caseNumber - a.caseNumber);

      if (matches.length === 0) {
        const embed = createDangerEmbed(interaction, {
          title: '❌ No Cases Found',
          description: `No cases were found for ${target}.`,
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const activeWarns = matches.filter(c => c.action === 'Warn' && c.cleared !== true).length;
      const clearedWarns = matches.filter(c => c.action === 'Warn' && c.cleared === true).length;
      const bans = matches.filter(c => c.action === 'Ban').length;
      const kicks = matches.filter(c => c.action === 'Kick').length;
      const timeouts = matches.filter(c => c.action === 'Timeout').length;

      const description = matches
        .slice(0, 15)
        .map((c) => {
          const clearedTag = c.cleared === true ? ' • Cleared' : '';
          return `**#${c.caseNumber}** • ${c.action}${clearedTag}\nReason: ${c.reason || 'No reason provided'}\n<t:${Math.floor(c.createdAt / 1000)}:R>`;
        })
        .join('\n\n');

      const embed = createPanelEmbed(interaction, {
        title: `🔎 Cases for ${target.username}`,
        description: trimText(description, 4096),
        thumbnail: target.displayAvatarURL({ dynamic: true }),
      }).addFields(
        { name: '⚠️ Active Warns', value: `${activeWarns}`, inline: true },
        { name: '🧹 Cleared Warns', value: `${clearedWarns}`, inline: true },
        { name: '🔨 Bans', value: `${bans}`, inline: true },
        { name: '👢 Kicks', value: `${kicks}`, inline: true },
        { name: '⏱️ Timeouts', value: `${timeouts}`, inline: true },
        { name: '📦 Total Cases', value: `${matches.length}`, inline: true }
      );

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'search-action') {
      const action = interaction.options.getString('action');
      const limit = interaction.options.getInteger('limit') || 10;

      const matches = allCases
        .filter((c) => c.action === action)
        .sort((a, b) => b.caseNumber - a.caseNumber)
        .slice(0, limit);

      const totalActionCases = allCases.filter(c => c.action === action);
      const clearedActionCases = totalActionCases.filter(c => c.cleared === true).length;
      const activeActionCases = totalActionCases.filter(c => c.cleared !== true).length;

      if (matches.length === 0) {
        const embed = createDangerEmbed(interaction, {
          title: '❌ No Cases Found',
          description: `No **${action}** cases were found for this server.`,
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const description = matches
        .map((c) => {
          const clearedTag = c.cleared === true ? ' • Cleared' : '';
          return `**#${c.caseNumber}** • ${c.targetTag}${clearedTag}\nReason: ${c.reason || 'No reason provided'}\n<t:${Math.floor(c.createdAt / 1000)}:R>`;
        })
        .join('\n\n');

      const embed = createPanelEmbed(interaction, {
        title: `📂 ${action} Cases`,
        description: trimText(description, 4096),
      }).addFields(
        { name: '👀 Shown', value: `${matches.length}`, inline: true },
        { name: '📦 Total', value: `${totalActionCases.length}`, inline: true },
        { name: '✅ Active', value: `${activeActionCases}`, inline: true },
        { name: '🧹 Cleared', value: `${clearedActionCases}`, inline: true }
      );

      return interaction.reply({ embeds: [embed] });
    }
  },
};