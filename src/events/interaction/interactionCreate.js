const automodPanel = require('../../functions/automod/automodPanel');
const embedPanel = require('../../functions/embed/embedPanel');

const { handleAdminNavigation } = require('../../functions/admin/adminPanel');
const security = require('../../security/securityCore');

function isAdminInteraction(interaction) {
  return String(interaction.customId || '').startsWith('admin:');
}

function isAutomodInteraction(interaction) {
  return String(interaction.customId || '').startsWith('automod:');
}

function isEmbedInteraction(interaction) {
  return String(interaction.customId || '').startsWith('embed:');
}

function isProtectedPanelInteraction(interaction) {
  return (
    interaction.isButton?.() ||
    interaction.isRoleSelectMenu?.() ||
    interaction.isChannelSelectMenu?.() ||
    interaction.isStringSelectMenu?.() ||
    interaction.isModalSubmit?.()
  ) && (
    isAdminInteraction(interaction) ||
    isAutomodInteraction(interaction) ||
    isEmbedInteraction(interaction)
  );
}

async function deny(interaction, message) {
  const payload = {
    content: message,
    embeds: [],
    components: [],
    flags: 64,
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }

  return interaction.reply(payload);
}

module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    try {
      if (!client) client = interaction.client;

      if (isProtectedPanelInteraction(interaction)) {
        const check = await security.enforceInteractionSecurity(interaction, {
          level: 'admin',
          cooldownKey: interaction.customId,
          cooldownMs: 1500,
          guildOnly: true,
        });

        if (!check.allowed) return;
      }

      const handledAutomod = await automodPanel.handleInteraction(interaction);
      if (handledAutomod) return;

      const handledEmbed = await embedPanel.handleInteraction(interaction);
      if (handledEmbed) return;

      if (isAdminInteraction(interaction)) {
        const handledAdmin = await handleAdminNavigation(interaction);
        if (handledAdmin) return;
      }

      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
          return await deny(interaction, '❌ Command not found.');
        }

        return await command.execute(interaction, client);
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
            return await deny(
              interaction,
              '❌ Please enter a number between 1 and 100.'
            );
          }

          const deleted = await interaction.channel.bulkDelete(amount, true);

          return await deny(
            interaction,
            `✅ Deleted ${deleted.size} message(s).`
          );
        }
      }
    } catch (error) {
      console.error('❌ Interaction error:', error);

      try {
        return await deny(
          interaction,
          '❌ Something went wrong while handling this interaction.'
        );
      } catch (replyError) {
        console.error('❌ Failed to send interaction error response:', replyError);
      }
    }
  },
};