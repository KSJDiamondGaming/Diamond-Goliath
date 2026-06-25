const loggingService = require('../../core/logging/service');

function webhookLabel(webhook) {
  if (!webhook) return 'Unknown Webhook';
  return `\`${webhook.name || 'Unknown'}\` (${webhook.id || 'N/A'})`;
}

function channelLabel(channel) {
  return channel ? `${channel}` : 'Unknown Channel';
}

async function logWebhookCreate(webhook) {
  if (!webhook?.guild) return;

  await loggingService.send(webhook.guild, 'webhook.create', {
    title: 'Webhook Created',
    color: '#57F287',
    fields: [
      { name: 'Webhook', value: webhookLabel(webhook), inline: true },
      { name: 'Channel', value: channelLabel(webhook.channel), inline: true },
      { name: 'Owner', value: webhook.owner ? `${webhook.owner}` : 'Unknown', inline: true },
    ],
  });
}

async function logWebhookDelete(webhook) {
  if (!webhook?.guild) return;

  await loggingService.send(webhook.guild, 'webhook.delete', {
    title: 'Webhook Deleted',
    color: '#ED4245',
    fields: [
      { name: 'Webhook', value: webhookLabel(webhook), inline: true },
      { name: 'Channel', value: channelLabel(webhook.channel), inline: true },
    ],
  });
}

async function logWebhookUpdate(oldWebhook, newWebhook) {
  if (!newWebhook?.guild) return;

  const changes = [];
  let eventType = 'webhook.update';

  if (oldWebhook.name !== newWebhook.name) {
    eventType = 'webhook.nameUpdate';
    changes.push(`Name: \`${oldWebhook.name || 'Unknown'}\` to \`${newWebhook.name || 'Unknown'}\``);
  }

  if (oldWebhook.channelId !== newWebhook.channelId) {
    eventType = eventType === 'webhook.update' ? 'webhook.channelUpdate' : eventType;
    changes.push(`Channel: \`${oldWebhook.channelId || 'Unknown'}\` to \`${newWebhook.channelId || 'Unknown'}\``);
  }

  if (oldWebhook.avatar !== newWebhook.avatar) {
    eventType = eventType === 'webhook.update' ? 'webhook.avatarUpdate' : eventType;
    changes.push('Avatar changed');
  }

  if (!changes.length) return;

  await loggingService.send(newWebhook.guild, eventType, {
    title: 'Webhook Updated',
    color: '#5865F2',
    fields: [
      { name: 'Webhook', value: webhookLabel(newWebhook), inline: true },
      { name: 'Channel', value: channelLabel(newWebhook.channel), inline: true },
      { name: 'Changes', value: changes.join('\n').slice(0, 1024), inline: false },
    ],
  });
}

module.exports = [
  { name: 'webhookCreate', async execute(webhook) { await logWebhookCreate(webhook); } },
  { name: 'webhookDelete', async execute(webhook) { await logWebhookDelete(webhook); } },
  { name: 'webhookUpdate', async execute(oldWebhook, newWebhook) { await logWebhookUpdate(oldWebhook, newWebhook); } },
];
