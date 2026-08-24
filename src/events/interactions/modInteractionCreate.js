'use strict';

const { Events } = require('discord.js');
const modInteractions = require('../../core/systems/mod/interactions');

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    const customId = String(interaction?.customId || '');
    if (!customId.startsWith('mod_') && !customId.startsWith('mod:')) return;

    const handled = await modInteractions.handleModInteraction(interaction);
    if (!handled) {
      throw new Error(`Mod did not handle ${customId}.`);
    }
  },
};
