'use strict';

const socialManager = require('./socialManager');

const COLORS = Object.freeze({
  info: 0x22c55e,
  warning: 0xf59e0b,
  error: 0xef4444,
  critical: 0x991b1b,
});

function formatDuration(value) {
  const totalSeconds = Math.max(0, Math.round(Number(value || 0) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function titleFor(incident = {}) {
  const provider = String(incident.provider || 'Provider').toUpperCase();
  if (incident.kind === 'recovery') return `${provider} provider recovered`;
  if (incident.kind === 'recovery_failed') return `${provider} recovery probe failed`;
  if (incident.kind === 'escalation') return `${provider} provider incident escalated`;
  return `${provider} provider outage detected`;
}

function descriptionFor(incident = {}) {
  if (incident.kind === 'recovery') {
    return `Provider monitoring recovered after ${formatDuration(incident.durationMs)}.`;
  }
  if (incident.kind === 'escalation') {
    return `The provider incident has remained unresolved for ${formatDuration(incident.durationMs)}.`;
  }
  if (incident.kind === 'recovery_failed') {
    return 'The provider recovery probe failed and the circuit was reopened.';
  }
  return 'Social Studio opened the provider circuit after repeated transient failures.';
}

function buildPayload(incident = {}) {
  const fields = [
    { name: 'Provider', value: String(incident.provider || 'unknown'), inline: true },
    { name: 'Severity', value: String(incident.severity || 'warning'), inline: true },
    { name: 'State', value: `${incident.previousState || 'unknown'} → ${incident.currentState || 'unknown'}`, inline: true },
  ];
  if (incident.failureType) fields.push({ name: 'Failure type', value: String(incident.failureType).slice(0, 1024), inline: true });
  if (incident.retryAt) fields.push({ name: 'Retry at', value: String(incident.retryAt).slice(0, 1024), inline: true });
  if (Number(incident.durationMs || 0) > 0) fields.push({ name: 'Duration', value: formatDuration(incident.durationMs), inline: true });
  if (incident.error) fields.push({ name: 'Last error', value: String(incident.error).slice(0, 1024), inline: false });

  return {
    embeds: [{
      color: COLORS[incident.severity] || COLORS.warning,
      title: titleFor(incident),
      description: descriptionFor(incident),
      fields,
      footer: { text: 'Goliath Social Studio • Provider Operations' },
      timestamp: incident.occurredAt || new Date().toISOString(),
    }],
    allowedMentions: { parse: [] },
  };
}

async function notify(guildId, incident, client) {
  const config = socialManager.getConfig(guildId);
  const channelId = config.logChannelId || null;
  if (!channelId) return { sent: false, skipped: true, reason: 'log_channel_not_configured' };

  const discordClient = client || global.client || global.discordClient;
  const channel = discordClient?.channels?.cache?.get?.(channelId)
    || await discordClient?.channels?.fetch?.(channelId).catch(() => null);
  if (!channel?.send) return { sent: false, skipped: true, reason: 'log_channel_unavailable', channelId };

  try {
    const message = await channel.send(buildPayload(incident));
    return { sent: true, skipped: false, channelId, messageId: message?.id || null };
  } catch (error) {
    return { sent: false, skipped: false, channelId, error: error?.message || String(error) };
  }
}

module.exports = {
  COLORS,
  formatDuration,
  titleFor,
  descriptionFor,
  buildPayload,
  notify,
};
