'use strict';

const { EmbedBuilder } = require('discord.js');
const guildManager = require('../../guild/guildManager');
const { SEVERITY } = require('./events');

function safeString(value, fallback = 'Unknown') {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function truncate(value, max = 1024, fallback = 'None') {
  const text = safeString(value, fallback).trim();
  return (text || fallback).slice(0, max);
}

function createIncidentId() {
  return `inc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getSeverityColor(severity) {
  switch (severity) {
    case SEVERITY.CRITICAL: return 0xff0000;
    case SEVERITY.HIGH: return 0xff7a00;
    case SEVERITY.MEDIUM: return 0xffcc00;
    case SEVERITY.LOW:
    default: return 0x5865f2;
  }
}

function resolveSecurityLogChannelId(guildId) {
  const security = guildManager.getSecurityConfig(guildId) || guildManager.getGuildSection(guildId, 'security', {}) || {};
  const logs = guildManager.getGuildSection(guildId, 'logs', {}) || {};
  return security?.incidentLogChannelId
    || security?.securityLogChannelId
    || logs?.channels?.admin
    || logs?.channels?.moderation
    || logs?.channels?.general
    || logs?.adminLogChannelId
    || logs?.modLogChannelId
    || logs?.logsChannelId
    || null;
}

function readIncidents(guildId) {
  try {
    const security = guildManager.getSecurityConfig(guildId) || guildManager.getGuildSection(guildId, 'security', {}) || {};
    return Array.isArray(security.incidents) ? security.incidents : [];
  } catch {
    return [];
  }
}

function writeIncidents(guildId, incidents = [], options = {}) {
  try {
    const security = guildManager.getSecurityConfig(guildId) || guildManager.getGuildSection(guildId, 'security', {}) || {};
    const maxStored = Math.max(25, Math.min(1000, Number(options.maxStored || 250)));
    if (typeof guildManager.updateSecurityConfig === 'function') {
      guildManager.updateSecurityConfig(guildId, (current = {}) => ({
        ...current,
        incidents: incidents.slice(0, maxStored),
      }));
    } else {
      guildManager.saveGuildSection(guildId, 'security', {
        ...security,
        incidents: incidents.slice(0, maxStored),
      });
    }
    return true;
  } catch (error) {
    console.warn(`[SecurityAudit] Failed to persist incident for guild ${guildId}:`, error?.message || error);
    return false;
  }
}

function buildIncidentEmbed(incident, options = {}) {
  const severity = safeString(incident.severity, SEVERITY.LOW).toUpperCase();
  const embed = new EmbedBuilder()
    .setColor(getSeverityColor(incident.severity))
    .setTitle(options.ownerMirror ? '🚨 Goliath Security Network Alert' : '🚨 Security Incident Logged')
    .setDescription(`**Type:** \`${truncate(incident.type, 100, 'unknown')}\`\n**Severity:** \`${severity}\``)
    .addFields(
      { name: 'Actor', value: incident.actorId ? `${truncate(incident.actorTag, 200, 'Unknown')} (\`${incident.actorId}\`)` : 'Unknown', inline: true },
      { name: 'Target', value: incident.targetId ? `${truncate(incident.targetName, 200, 'Unknown')} (\`${incident.targetId}\`)` : truncate(incident.targetName, 200, 'None'), inline: true },
      { name: 'Guild', value: truncate(incident.guildName, 200, incident.guildId || 'Unknown'), inline: true },
      { name: 'Reason', value: truncate(incident.reason, 1024, 'No reason provided.'), inline: false },
      { name: 'Action Taken', value: truncate(incident.actionTaken, 1024, 'Logged only.'), inline: false },
    )
    .setFooter({ text: truncate(incident.id, 200, 'Security incident') })
    .setTimestamp(new Date(incident.createdAt));
  return embed;
}

async function sendIncidentToChannel(guild, incident, options = {}) {
  if (!guild || options.sendToChannel === false) return false;
  const channelId = options.channelId || resolveSecurityLogChannelId(guild.id);
  if (!channelId) return false;
  try {
    const channel = guild.channels.cache.get(String(channelId)) || await guild.channels.fetch(String(channelId)).catch(() => null);
    if (!channel?.isTextBased?.()) return false;
    await channel.send({ embeds: [buildIncidentEmbed(incident)], allowedMentions: { parse: [] } });
    return true;
  } catch (error) {
    console.warn(`[SecurityAudit] Failed to send incident ${incident.id} to guild ${guild.id}:`, error?.message || error);
    return false;
  }
}

async function sendIncidentToOwner(guild, incident, options = {}) {
  if (!guild || options.sendToOwner !== true) return false;
  try {
    const owner = await guild.fetchOwner().catch(() => null);
    if (!owner) return false;
    await owner.send({ embeds: [buildIncidentEmbed(incident, { ownerMirror: true })], allowedMentions: { parse: [] } });
    return true;
  } catch (error) {
    console.warn(`[SecurityAudit] Failed to mirror incident ${incident.id} to owner for guild ${guild.id}:`, error?.message || error);
    return false;
  }
}

async function logIncident(guild, options = {}) {
  const guildId = safeString(options.guildId || guild?.id);
  const guildName = safeString(options.guildName || guild?.name);
  const incident = {
    id: options.id || createIncidentId(),
    type: options.type || 'unknown_security_incident',
    severity: options.severity || SEVERITY.LOW,
    guildId,
    guildName,
    actorId: options.actorId || null,
    actorTag: options.actorTag || null,
    targetId: options.targetId || null,
    targetName: options.targetName || null,
    targetType: options.targetType || null,
    reason: options.reason || null,
    actionTaken: options.actionTaken || null,
    metadata: options.metadata || {},
    createdAt: options.createdAt || new Date().toISOString(),
  };
  const current = readIncidents(guildId);
  const persisted = writeIncidents(guildId, [incident, ...current], options);
  incident.persisted = persisted;

  if (guild) {
    const [channelLogged, ownerMirrored] = await Promise.all([
      sendIncidentToChannel(guild, incident, options),
      sendIncidentToOwner(guild, incident, options),
    ]);
    incident.channelLogged = channelLogged;
    incident.ownerMirrored = ownerMirrored;
  }
  return incident;
}

module.exports = {
  resolveSecurityLogChannelId,
  readIncidents,
  writeIncidents,
  buildIncidentEmbed,
  sendIncidentToChannel,
  sendIncidentToOwner,
  logIncident,
};
