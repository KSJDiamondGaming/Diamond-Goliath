const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const buildEmbed = require('../../utils/buildEmbed');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw ? JSON.parse(raw) : {};
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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
    const caseDetailsPath = path.join(__dirname, '..', '..', 'data', 'modCaseDetails.json');

    const data = readJson(caseDetailsPath);
    const guildCases = data[interaction.guild.id] || {};
    const allCases = Object.values(guildCases);

    if (sub === 'view') {
      const caseNumber = interaction.options.getInteger('number');
      const caseData = guildCases[caseNumber];

      if (!caseData) {
        return interaction.reply({
          content: `❌ Case #${caseNumber} was not found.`,
          ephemeral: true,
        });
      }

      const fields = [
        {
          name: '📌 Action',
          value: caseData.action,
          inline: true,
        },
        {
          name: '👤 Target',
          value: `${caseData.targetTag}\n\`${caseData.targetId}\``,
          inline: true,
        },
        {
          name: '🛡️ Moderator',
          value: `${caseData.moderatorTag}\n\`${caseData.moderatorId}\``,
          inline: true,
        },
        {
          name: '🕒 Created',
          value: `<t:${Math.floor(caseData.createdAt / 1000)}:F>`,
          inline: false,
        },
        {
          name: '📝 Reason',
          value: caseData.reason || 'No reason provided',
          inline: false,
        },
      ];

      if (caseData.cleared === true) {
        fields.push({
          name: '🧹 Cleared',
          value: `Yes\nBy ${caseData.clearedByTag}\n<t:${Math.floor(caseData.clearedAt / 1000)}:F>`,
          inline: false,
        });

        if (caseData.clearReason) {
          fields.push({
            name: '📝 Clear Reason',
            value: caseData.clearReason,
            inline: false,
          });
        }
      }

      if (caseData.duration) {
        fields.push({
          name: '⏱️ Duration',
          value: caseData.duration,
          inline: true,
        });
      }

      if (caseData.evidence) {
        fields.push({
          name: '📎 Evidence',
          value: caseData.evidence,
          inline: false,
        });
      }

      if (caseData.notes && caseData.notes.length > 0) {
        const notesText = caseData.notes
          .map((note, index) => {
            return `**${index + 1}.** ${note.text}\n*By ${note.moderatorTag} • <t:${Math.floor(note.createdAt / 1000)}:R>*`;
          })
          .join('\n\n')
          .slice(0, 1024);

        fields.push({
          name: '🗒️ Notes',
          value: notesText,
          inline: false,
        });
      }

      const embed = buildEmbed(interaction.guild.id, {
        title: `📁 Case #${caseData.caseNumber}`,
        description: 'Moderation case details',
        fields,
      });

      return interaction.reply({
        embeds: [embed],
      });
    }

    if (sub === 'note') {
      const caseNumber = interaction.options.getInteger('number');
      const text = interaction.options.getString('text');
      const caseData = guildCases[caseNumber];

      if (!caseData) {
        return interaction.reply({
          content: `❌ Case #${caseNumber} was not found.`,
          ephemeral: true,
        });
      }

      if (!caseData.notes) {
        caseData.notes = [];
      }

      caseData.notes.push({
        text,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        createdAt: Date.now(),
      });

      writeJson(caseDetailsPath, data);

      return interaction.reply({
        content: `✅ Added a note to case #${caseNumber}.`,
      });
    }

    if (sub === 'delete-note') {
      const caseNumber = interaction.options.getInteger('number');
      const noteNumber = interaction.options.getInteger('note');
      const caseData = guildCases[caseNumber];

      if (!caseData) {
        return interaction.reply({
          content: `❌ Case #${caseNumber} was not found.`,
          ephemeral: true,
        });
      }

      if (!caseData.notes || caseData.notes.length === 0) {
        return interaction.reply({
          content: `❌ Case #${caseNumber} has no notes.`,
          ephemeral: true,
        });
      }

      if (noteNumber < 1 || noteNumber > caseData.notes.length) {
        return interaction.reply({
          content: `❌ Note #${noteNumber} does not exist on case #${caseNumber}.`,
          ephemeral: true,
        });
      }

      caseData.notes.splice(noteNumber - 1, 1);
      writeJson(caseDetailsPath, data);

      return interaction.reply({
        content: `✅ Deleted note #${noteNumber} from case #${caseNumber}.`,
      });
    }

    if (sub === 'list') {
      const limit = interaction.options.getInteger('limit') || 10;

      const casesArray = allCases
        .sort((a, b) => b.caseNumber - a.caseNumber)
        .slice(0, limit);

      if (casesArray.length === 0) {
        return interaction.reply({
          content: '❌ No moderation cases found for this server.',
          ephemeral: true,
        });
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
        .join('\n\n')
        .slice(0, 4096);

      const embed = buildEmbed(interaction.guild.id, {
        title: '📚 Recent Moderation Cases',
        description,
        fields: [
          { name: 'Warns', value: `${warnCount}`, inline: true },
          { name: 'Bans', value: `${banCount}`, inline: true },
          { name: 'Kicks', value: `${kickCount}`, inline: true },
          { name: 'Timeouts', value: `${timeoutCount}`, inline: true },
          { name: 'Cleared', value: `${clearedCount}`, inline: true },
          { name: 'Total Cases', value: `${allCases.length}`, inline: true },
        ],
      });

      return interaction.reply({
        embeds: [embed],
      });
    }

    if (sub === 'search-user') {
      const target = interaction.options.getUser('target');

      const matches = allCases
        .filter((c) => c.targetId === target.id)
        .sort((a, b) => b.caseNumber - a.caseNumber);

      if (matches.length === 0) {
        return interaction.reply({
          content: `❌ No cases found for **${target.tag}**.`,
          ephemeral: true,
        });
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
          return `**#${c.caseNumber}** • ${c.action}${clearedTag}\nReason: ${c.reason}\n<t:${Math.floor(c.createdAt / 1000)}:R>`;
        })
        .join('\n\n')
        .slice(0, 4096);

      const embed = buildEmbed(interaction.guild.id, {
        title: `🔎 Cases for ${target.tag}`,
        description,
        thumbnail: target.displayAvatarURL({ forceStatic: false }),
        fields: [
          { name: 'Active Warns', value: `${activeWarns}`, inline: true },
          { name: 'Cleared Warns', value: `${clearedWarns}`, inline: true },
          { name: 'Bans', value: `${bans}`, inline: true },
          { name: 'Kicks', value: `${kicks}`, inline: true },
          { name: 'Timeouts', value: `${timeouts}`, inline: true },
          { name: 'Total Cases', value: `${matches.length}`, inline: true },
        ],
      });

      return interaction.reply({
        embeds: [embed],
      });
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
        return interaction.reply({
          content: `❌ No **${action}** cases found for this server.`,
          ephemeral: true,
        });
      }

      const description = matches
        .map((c) => {
          const clearedTag = c.cleared === true ? ' • Cleared' : '';
          return `**#${c.caseNumber}** • ${c.targetTag}${clearedTag}\nReason: ${c.reason}\n<t:${Math.floor(c.createdAt / 1000)}:R>`;
        })
        .join('\n\n')
        .slice(0, 4096);

      const embed = buildEmbed(interaction.guild.id, {
        title: `📂 ${action} Cases`,
        description,
        fields: [
          { name: 'Shown', value: `${matches.length}`, inline: true },
          { name: 'Total', value: `${totalActionCases.length}`, inline: true },
          { name: 'Active', value: `${activeActionCases}`, inline: true },
          { name: 'Cleared', value: `${clearedActionCases}`, inline: true },
        ],
      });

      return interaction.reply({
        embeds: [embed],
      });
    }
  },
};