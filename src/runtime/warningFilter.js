const originalEmitWarning = process.emitWarning.bind(process);

process.emitWarning = (warning, ...args) => {
  const message = String(typeof warning === 'string' ? warning : warning?.message || '');
  const warningName = typeof args[0] === 'string' ? args[0] : args[0]?.type || warning?.name;
  const isKnownDiscordReadyWarning = warningName === 'DeprecationWarning' && message.includes('ready event has been renamed to clientReady');

  if (isKnownDiscordReadyWarning) {
    return;
  }

  originalEmitWarning(warning, ...args);
};

// Discord.js modal submissions can carry the source message even when
// isFromMessage() reports false. Treat an attached source message as the
// authoritative signal so panel modal submissions edit the existing ephemeral
// panel instead of creating another "Only you can see this" response.
try {
  const { ModalSubmitInteraction } = require('discord.js');
  const originalIsFromMessage = ModalSubmitInteraction?.prototype?.isFromMessage;

  if (typeof originalIsFromMessage === 'function') {
    ModalSubmitInteraction.prototype.isFromMessage = function isFromMessage() {
      return Boolean(this.message) || originalIsFromMessage.call(this);
    };
  }
} catch (error) {
  console.warn('[Runtime] Unable to apply modal source-message compatibility fix.');
  console.warn(error?.stack || error?.message || error);
}
