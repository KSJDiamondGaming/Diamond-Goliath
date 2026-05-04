const automodPanel = require('../../functions/automod/automodPanel');
const embedPanel = require('../../functions/embed/embedPanel');

const { handleAdminNavigation } = require('../../functions/admin/adminPanel');

module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    try {
      if (!client) client = interaction.client;

      const handledAutomod = await automodPanel.handleInteraction(interaction);
      if (handledAutomod) return;

      const handledEmbed = await embedPanel.handleInteraction(interaction);
      if (handledEmbed) return;

      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
          return await interaction.reply({
            content: '❌ Command not found.',
            flags: 64,
          });
        }

        return await command.execute(interaction, client);
      }

      if (
        interaction.isButton() ||
        interaction.isRoleSelectMenu() ||
        interaction.isChannelSelectMenu()
      ) {
        if (interaction.customId?.startsWith('admin:')) {
          const handled = await handleAdminNavigation(interaction);
          if (handled) return;
        }
      }

      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'help-category-select') {
          const helpCommand = client.commands.get('help');

          if (helpCommand?.handleHelpSelectMenu) {
            return await helpCommand.handleHelpSelectMenu(interaction, client);
          }
        }

        return;
      }

      if (interaction.isButton()) {
        if (
          interaction.customId === 'help-back-home' ||
          interaction.customId === 'help-close'
        ) {
          const helpCommand = client.commands.get('help');

          if (helpCommand?.handleHelpButton) {
            return await helpCommand.handleHelpButton(interaction, client);
          }
        }

        console.warn('⚠️ Unhandled button:', interaction.customId);
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId === 'admin:purgeModal') {
          const rawAmount = interaction.fields.getTextInputValue('amount');
          const amount = Number(rawAmount);

          if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
            return await interaction.reply({
              content: '❌ Please enter a number between 1 and 100.',
              flags: 64,
            });
          }

          const deleted = await interaction.channel.bulkDelete(amount, true);

          return await interaction.reply({
            content: `✅ Deleted ${deleted.size} message(s).`,
            flags: 64,
          });
        }
      }
    } catch (error) {
      console.error('❌ Interaction error:', error);

      const payload = {
        content: '❌ Something went wrong while handling this interaction.',
        embeds: [],
        components: [],
        flags: 64,
      };

      try {
        if (interaction.deferred || interaction.replied) {
          return await interaction.editReply(payload);
        }

        return await interaction.reply(payload);
      } catch (replyError) {
        console.error('❌ Failed to send interaction error response:', replyError);
      }
    }
  },
};