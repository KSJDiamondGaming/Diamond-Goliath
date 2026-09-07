'use strict';

const { Events } = require('discord.js');
const modInteractions = require('../../core/administration/mod/interactions');
const quarantineInteractions = require('../../core/administration/mod/quarantineInteractions');

const PATCH_MARKER = Symbol.for('goliath.mod.quarantineInteractionBridge');

if (!modInteractions[PATCH_MARKER] && typeof modInteractions.handleModInteraction === 'function') {
  const originalHandleModInteraction = modInteractions.handleModInteraction.bind(modInteractions);

  modInteractions.handleModInteraction = async function handleModInteractionWithQuarantineModes(interaction) {
    const id = String(interaction?.customId || '');
    const isQuarantineInteraction = id.startsWith('mod_open_quarantine:')
      || id.startsWith('mod_quarantine_investigation:')
      || id.startsWith('mod_quarantine_security:')
      || id.startsWith('mod_remove_quarantine:')
      || id.startsWith('mod_submit_quarantine_investigation:')
      || id.startsWith('mod_submit_quarantine_security:')
      || id.startsWith('mod_submit_quarantine:');

    if (isQuarantineInteraction) {
      const handled = await quarantineInteractions.handleQuarantineInteraction(interaction);
      if (handled) return true;
    }

    return originalHandleModInteraction(interaction);
  };

  Object.defineProperty(modInteractions, PATCH_MARKER, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

// The behavior is installed at module-load time so the existing central
// InteractionCreate router keeps a single source of truth for mod_ routing.
module.exports = {
  name: Events.ClientReady,
  once: true,
  execute() {
    return true;
  },
};
