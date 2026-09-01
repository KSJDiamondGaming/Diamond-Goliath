'use strict';

const {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');
const ownerPanel = require('./command');

// Keep /owner completely out of guild-installed command sets. Discord exposes
// this command only through a USER_INSTALL of the application. Using the full
// USER_INSTALL interaction-context set matches Discord's supported profile-style
// user command pattern while the execution gate below keeps the owner panel
// guild-only and OWNER_IDS protected.
const data = new SlashCommandBuilder()
  .setName('owner')
  .setDescription('Open the private Goliath owner control panel.')
  .setIntegrationTypes(ApplicationIntegrationType.UserInstall)
  .setContexts(
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  );

async function execute(interaction, client) {
  if (!interaction?.guildId) {
    return interaction.reply({
      content: '❌ The Goliath owner panel can only be opened inside a server.',
      flags: MessageFlags.Ephemeral,
    }).catch(() => null);
  }
  return ownerPanel.execute(interaction, client);
}

module.exports = {
  ...ownerPanel,
  data,
  execute,
  category: 'Owner',
  access: { ownerOnly: true, userInstallOnly: true },
};
