module.exports = {
  name: 'interactionCreate',

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const commandName = interaction.commandName;
    const command = interaction.client.commands.get(commandName);

    if (interaction.client.isBooting) {
      try {
        await interaction.reply({
          content: '⏳ The bot is still starting up. Please try again in a moment.',
          ephemeral: true,
        });
      } catch (error) {
        console.error(`❌ Failed boot reply for /${commandName}:`, error);
      }
      return;
    }

    if (!command) {
      console.warn(`⚠️ Command not loaded: /${commandName}`);

      try {
        await interaction.reply({
          content: `❌ The command \`/${commandName}\` is not currently available on the bot.`,
          ephemeral: true,
        });
      } catch (error) {
        console.error(`❌ Failed missing-command reply for /${commandName}:`, error);
      }

      return;
    }

    const startedAt = Date.now();
    let watchdog = null;

    try {
      watchdog = setTimeout(async () => {
        try {
          if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
            console.warn(`⏱️ Auto-deferred slow command: /${commandName}`);
          }
        } catch (error) {
          if (error.code !== 40060) {
            console.error(`❌ Failed auto-defer for /${commandName}:`, error);
          }
        }
      }, 1500);

      await command.execute(interaction);

      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }

      const duration = Date.now() - startedAt;
      if (duration > 2500) {
        console.warn(`⏱️ Slow command detected: /${commandName} took ${duration}ms`);
      }
    } catch (error) {
      console.error(`❌ Error executing /${commandName}:`, error);

      const errorPayload = {
        content: '❌ There was an error while running this command.',
        embeds: [],
      };

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(errorPayload);
        } else {
          await interaction.reply({
            ...errorPayload,
            ephemeral: true,
          });
        }
      } catch (replyError) {
        console.error(`❌ Failed to send error response for /${commandName}:`, replyError);
      }
    } finally {
      if (watchdog) clearTimeout(watchdog);
    }
  },
};