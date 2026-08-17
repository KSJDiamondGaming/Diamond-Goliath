'use strict';

const { INCIDENT_REMINDER_EVERY } = require('./constants');
const environment = (client) => String(client?.botMode || process.env.BOT_MODE || 'DEV').toUpperCase();
async function destination(client) {
  const env = environment(client); const channelId = process.env[`${env}_HEALTH_CHANNEL_ID`] || process.env.GOLIATH_HEALTH_CHANNEL_ID;
  if (channelId) { const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null); if (channel?.isTextBased?.()) return channel; }
  const ownerId = process.env.GOLIATH_HEALTH_OWNER_ID || process.env.BOT_OWNER_ID || process.env.OWNER_USER_ID;
  if (ownerId) return client.users.fetch(ownerId).catch(() => null);
  return null;
}
function detailsLines(details = {}) { return Object.entries(details).filter(([, v]) => v !== undefined && v !== null && v !== '').slice(0, 12).map(([k, v]) => `**${k}:** ${String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 700)}`); }
async function send(client, incident, kind = 'open') {
  const target = await destination(client); if (!target) return false;
  const icon = kind === 'resolved' ? '✅' : incident.severity === 'critical' ? '🚨' : incident.severity === 'error' ? '🟠' : '🟡'; const title = kind === 'resolved' ? 'RECOVERED' : String(incident.severity || 'warning').toUpperCase();
  const lines = [`${icon} **${title} — Goliath Health Watch**`, `**Incident:** \`${incident.id}\``, `**Environment:** ${incident.environment}`, incident.guildName || incident.guildId ? `**Guild:** ${incident.guildName || 'Unknown'}${incident.guildId ? ` (\`${incident.guildId}\`)` : ''}` : null, `**Module:** ${incident.module}`, `**Component:** ${incident.component}`, `**Problem:** ${incident.message}`, kind === 'resolved' ? `**Recovered:** ${incident.resolvedAt || new Date().toISOString()}` : `**Occurrences:** ${incident.occurrences}`, ...detailsLines(kind === 'resolved' ? incident.recoveryDetails : incident.details)].filter(Boolean);
  await target.send({ content: lines.join('\n').slice(0, 1900), allowedMentions: { parse: [] } }).catch(() => null); return true;
}
function shouldRemind(incident, opened) { return opened || (Number(incident?.occurrences || 0) > 0 && Number(incident.occurrences) % INCIDENT_REMINDER_EVERY === 0); }
module.exports = { send, shouldRemind, destination };
