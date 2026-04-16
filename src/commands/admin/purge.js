const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete a number of messages from this channel')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    console.log('🧨 PURGE EXECUTE', {
      pid: process.pid,
      id: interaction.id,
      deferred: interaction.deferred,
      replied: interaction.replied,
      createdTimestamp: interaction.createdTimestamp,
      now: Date.now(),
      ageMs: Date.now() - interaction.createdTimestamp,
    });

    const amount = interaction.options.getInteger('amount');

    try {
      let deferAccepted = false;

      try {
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        });
        deferAccepted = true;
        console.log('✅ deferReply accepted');
      } catch (error) {
        console.error('❌ deferReply failed:', error);

        // Possible false-positive 10062 from Discord/API
        if (error?.code === 10062) {
          console.log('⚠️ 10062 on deferReply; testing whether Discord actually acknowledged it...');
          await new Promise(resolve => setTimeout(resolve, 750));

          try {
            await interaction.editReply({
              content: '⏳ Interaction was actually acknowledged. Continuing purge...',
            });
            deferAccepted = true;
            console.log('✅ editReply worked after 10062; defer was likely accepted anyway');
          } catch (editErr) {
            console.error('❌ editReply after 10062 also failed:', editErr);
            throw error;
          }
        } else {
          throw error;
        }
      }

      if (!deferAccepted) {
        return;
      }

      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return await interaction.editReply({
          content: '❌ You do not have permission to use this command.',
        });
      }

      const botMember =
        interaction.guild.members.me ??
        await interaction.guild.members.fetchMe();

      if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return await interaction.editReply({
          content: '❌ I need the **Manage Messages** permission to do that.',
        });
      }

      const deleted = await interaction.channel.bulkDelete(amount, true);

      await interaction.editReply({
        content: `🧹 Deleted **${deleted.size}** message(s).`,
      });
    } catch (error) {
      console.error('❌ /purge final error:', error);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: '❌ Something went wrong while trying to purge messages.',
          });
        }
      } catch (replyErr) {
        console.error('❌ /purge fallback failed:', replyErr);
      }
    }
  },
};