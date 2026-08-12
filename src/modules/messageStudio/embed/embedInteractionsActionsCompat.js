'use strict';

const original = require('./embedInteractionsButtonsCompat');
const { handleButtonAction } = require('./embedButtonActions');

async function handleInteraction(interaction) {
  if (await handleButtonAction(interaction)) return true;
  return original.handleInteraction(interaction);
}

module.exports = { handleInteraction };
