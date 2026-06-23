// src/events/messages/webhookUpdate.js

const {
  handleWebhookUpdate,
} = require('../../security/securitySystem');

module.exports = {
  name: 'webhookUpdate',

  async execute(channel) {
    if (!channel?.guild) return;

    try {
      await handleWebhookUpdate(channel);
    } catch (error) {
      console.error(
        '[WebhookUpdate] Failed to process webhook update:',
        error
      );
    }
  },
};
