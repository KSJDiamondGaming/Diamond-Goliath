// src/events/messages/webhookUpdate.js

const { AuditLogEvent } = require('discord.js');

const {
  handleWebhookCreate,
  handleWebhookDelete,
} = require('../../security/antiNukeManager');

module.exports = {
  name: 'webhookUpdate',

  async execute(channel) {
    if (!channel?.guild) return;

    const guild = channel.guild;

    try {
      const logs = await guild.fetchAuditLogs({
        limit: 1,
      });

      const entry = logs.entries.first();

      if (!entry) return;

      const isRecent =
        Date.now() - entry.createdTimestamp < 8_000;

      if (!isRecent) return;

      if (entry.action === AuditLogEvent.WebhookCreate) {
        return handleWebhookCreate({
          id: entry.target?.id || null,
          name: entry.target?.name || 'Unknown Webhook',
          guild,
          channelId: channel.id,
        });
      }

      if (entry.action === AuditLogEvent.WebhookDelete) {
        return handleWebhookDelete({
          id: entry.target?.id || null,
          name: entry.target?.name || 'Unknown Webhook',
          guild,
          channelId: channel.id,
        });
      }
    } catch (error) {
      console.error(
        '[WebhookUpdate] Failed to process webhook update:',
        error
      );
    }
  },
};