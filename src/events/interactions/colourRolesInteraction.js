'use strict';

const { Events } = require('discord.js');
const colourRolesPanel = require('../../modules/roleStudio/colourRoles/colourRolesPanel');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const customId = String(interaction?.customId || '');
    if (!customId.startsWith('admin:colourRoles') && !customId.startsWith('colourRoles:')) return;
    await colourRolesPanel.handleColourRolesInteraction(interaction);
  },
};
