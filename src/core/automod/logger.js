const logService = require('../logging/service');
const { LOG_TYPES } = require('../logging/types');

function formatAutomodActions(action) {
  const actions = String(action || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const labels = {
    delete: 'Message deleted',
    warn: 'User warned in channel',
    'warn-dm': 'User warned by DM',
    timeout: 'User timed out',
    kick: 'User kicked',
    ban: 'User banned',
  };

  return actions.map((entry) => labels[entry] || entry).join('\n');
}

async function sendAutomodLog(message, config, details) {
  if (!message?.guild) return;
  if (!config?.logs?.enabled) return;

  const colors = {
    'Anti-Link': '#e74c3c',
    'Caps Abuse': '#f39c12',
    'Bad Words': '#c0392b',
    'Anti-Spam': '#9b59b6',
    'Repeated Messages': '#8e44ad',
    'Anti-Invite': '#3498db',
    'Blacklisted Domain': '#c0392b',
    'Suspicious Domain': '#e67e22',
  };

  const emojis = {
    'Anti-Link': '🔗',
    'Caps Abuse': '🔠',
    'Bad Words': '🚫',
    'Anti-Spam': '📨',
    'Repeated Messages': '🔁',
    'Anti-Invite': '📩',
    'Blacklisted Domain': '⛔',
    'Suspicious Domain': '⚠️',
  };

  const severities = {
    'Anti-Link': 'High',
    'Blacklisted Domain': 'Critical',
    'Suspicious Domain': 'High',
    'Caps Abuse': 'Medium',
    'Bad Words': 'High',
    'Anti-Spam': 'Medium',
    'Repeated Messages': 'Low',
    'Anti-Invite': 'High',
  };

  await logService.send(message.guild, LOG_TYPES.AUTOMOD_ACTION, {
    color: colors[details.rule] || '#ff5555',
    title: `${emojis[details.rule] || '🤖'} AutoMod: ${
      details.rule || 'Triggered'
    }`,
    user: message.author,
    reason: details.reason || 'No reason provided',
    fields: [
      {
        name: 'Channel',
        value: `${message.channel}`,
        inline: true,
      },
      {
        name: 'Rule',
        value: details.rule || 'Unknown',
        inline: true,
      },
      {
        name: 'Actions Taken',
        value: formatAutomodActions(details.action || 'delete'),
        inline: true,
      },
      {
        name: 'Severity',
        value: severities[details.rule] || 'Medium',
        inline: true,
      },
      {
        name: 'Message Content',
        value:
          details.content && details.content.length > 1024
            ? `${details.content.slice(0, 1021)}...`
            : details.content || 'N/A',
      },
    ],
  });
}

module.exports = {
  formatAutomodActions,
  sendAutomodLog,
};