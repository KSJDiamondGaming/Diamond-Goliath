const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { addPunishment } = require('../../utils/tempPunishmentsStore');
const logModerationAction = require('../../utils/logging/logModerationAction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tempmute')
    .setDescription('Temporarily mute a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to mute').setRequired(true))
    .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const duration = interaction.options.getInteger('duration');

    const member = await interaction.guild.members.fetch(user.id);

    const ms = duration * 60 * 1000;

    await member.timeout(ms, `Temp mute: ${duration} minutes`);

    addPunishment({
      userId: user.id,
      guildId: interaction.guild.id,
      type: 'mute',
      expiresAt: Date.now() + ms
    });

    await interaction.reply(`🔇 Muted ${user.tag} for ${duration} minutes.`);
  }
};