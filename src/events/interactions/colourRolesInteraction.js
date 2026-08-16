'use strict';

const { Events } = require('discord.js');
const colourRolesPanel = require('../../modules/roleStudio/colourRoles/colourRolesPanel');
const roleStudioPanel = require('../../modules/roleStudio/roleStudioPanel');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const customId = String(interaction?.customId || '');

    if (customId === 'admin:studio:roleStudio') {
      interaction.customId = 'admin:roleStudio:handled';
      const payload = await roleStudioPanel.buildRoleStudioPanel(
        interaction.guild,
        interaction.member?.displayName || interaction.user?.username || 'Unknown User'
      );
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.update(payload);
      return;
    }

    if (!customId.startsWith('admin:colourRoles') && !customId.startsWith('colourRoles:')) return;
    await colourRolesPanel.handleColourRolesInteraction(interaction);
  },
};
