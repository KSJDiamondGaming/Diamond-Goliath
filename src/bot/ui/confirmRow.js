const { ActionRowBuilder } = require('discord.js');
const { dangerButton, secondaryButton } = require('./buttonBuilder');

// ✅ Confirm / Cancel Row
function buildConfirmRow(confirmId, cancelId = 'cancel_action') {
  return [
    new ActionRowBuilder().addComponents(
      dangerButton(confirmId, 'Confirm', '⚠️'),
      secondaryButton(cancelId, 'Cancel', '❌')
    )
  ];
}

module.exports = {
  buildConfirmRow
};