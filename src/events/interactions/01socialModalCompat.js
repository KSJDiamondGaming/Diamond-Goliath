'use strict';

const { Events } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const customId = String(interaction?.customId || '');
    if (!interaction?.isModalSubmit?.() || !customId.startsWith('social:')) return;

    // Discord modal submissions opened from a message component can update the
    // originating ephemeral panel. Some discord.js interaction shapes report
    // isFromMessage() as false even though update()/deferUpdate() are available.
    // Social Studio relies on that update path so the panel refreshes immediately
    // after a modal is submitted instead of posting a separate confirmation.
    if (typeof interaction.update === 'function' || typeof interaction.deferUpdate === 'function') {
      interaction.isFromMessage = () => true;
    }
  },
};
