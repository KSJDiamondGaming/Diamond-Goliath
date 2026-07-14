$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host 'Building Reaction Roles module...' -ForegroundColor Cyan

@'
from pathlib import Path
import re

root = Path('.')

def write(path, content):
    p = root / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.strip() + '\n', encoding='utf-8')

def replace(path, old, new):
    p = root / path
    text = p.read_text(encoding='utf-8')
    if old not in text:
        print(f'WARN: pattern not found in {path}: {old[:80]}')
        return
    p.write_text(text.replace(old, new), encoding='utf-8')

reaction_roles = r'''\
'use strict';

const crypto = require('crypto');
const { getModuleSection, saveModuleSection, updateModuleSection } = require('../../core/guild/moduleSectionManager');
const { canManageRole } = require('../../core/security/goliathPermissionGuard');

const MODULE = 'reactionRoles';
const MODES = Object.freeze({ TOGGLE: 'toggle', ADD: 'add', REMOVE: 'remove' });

function now() { return new Date().toISOString(); }
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function cleanId(value) {
  const id = String(value || '').replace(/[<@&#!>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}
function cleanString(value, fallback = '', max = 1000) { return String(value ?? fallback).trim().slice(0, max); }
function cleanKey(value, prefix = 'rr') {
  const key = String(value || '').toLowerCase().trim().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return (key || `${prefix}_${crypto.randomUUID().slice(0, 8)}`).slice(0, 80);
}
function emojiKey(value) {
  const raw = cleanString(value, '', 100);
  const custom = raw.match(/^<a?:([^:>]+):(\d{15,25})>$/);
  if (custom) return custom[2];
  return raw;
}
function reactionKey(emoji) { return emoji?.id || emoji?.name || ''; }

function defaultSection() {
  return {
    enabled: true,
    settings: { removeOnUnreact: true, ignoreBots: true },
    panels: {},
    analytics: { assigned: 0, removed: 0, failed: 0, attached: 0, synced: 0 },
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizeMapping(mapping = {}) {
  const roleId = cleanId(mapping.roleId || mapping.id);
  return {
    mappingId: cleanKey(mapping.mappingId || `${emojiKey(mapping.emoji)}-${roleId}`, 'mapping'),
    emoji: cleanString(mapping.emoji, '', 100),
    roleId,
    label: cleanString(mapping.label || mapping.roleName || 'Role', 'Role', 100),
    mode: Object.values(MODES).includes(mapping.mode) ? mapping.mode : MODES.TOGGLE,
    removeOnUnreact: mapping.removeOnUnreact !== false,
    enabled: mapping.enabled !== false,
    createdAt: mapping.createdAt || now(),
    updatedAt: now(),
  };
}

function normalizePanel(panel = {}) {
  const panelId = cleanKey(panel.panelId || panel.id, 'panel');
  return {
    panelId,
    id: panelId,
    enabled: panel.enabled !== false,
    source: panel.source === 'created' ? 'created' : 'existing',
    channelId: cleanId(panel.channelId),
    messageId: cleanId(panel.messageId),
    messageUrl: cleanString(panel.messageUrl || '', '', 300) || null,
    title: cleanString(panel.title || 'Reaction Roles', 'Reaction Roles', 100),
    mappings: (Array.isArray(panel.mappings) ? panel.mappings : panel.roles || []).map(normalizeMapping).filter((item) => item.roleId && item.emoji),
    createdAt: panel.createdAt || now(),
    updatedAt: now(),
    createdBy: cleanId(panel.createdBy),
    lastSyncedAt: panel.lastSyncedAt || null,
    lastError: cleanString(panel.lastError || '', '', 500) || null,
  };
}

function normalizeSection(section = {}) {
  const base = defaultSection();
  const panels = section.panels && typeof section.panels === 'object' ? section.panels : {};
  return {
    ...base,
    ...section,
    enabled: section.enabled !== false,
    settings: { ...base.settings, ...(section.settings || {}) },
    panels: Object.fromEntries(Object.entries(panels).map(([id, panel]) => {
      const normalized = normalizePanel({ ...panel, panelId: panel.panelId || id });
      return [normalized.panelId, normalized];
    })),
    analytics: { ...base.analytics, ...(section.analytics || {}) },
    updatedAt: section.updatedAt || now(),
  };
}

function getSection(guildId) { return normalizeSection(getModuleSection(guildId, MODULE, defaultSection())); }
function saveSection(guildId, section, meta = {}) { return normalizeSection(saveModuleSection(guildId, MODULE, normalizeSection(section), meta)); }
function updateSection(guildId, updater, meta = {}) {
  return normalizeSection(updateModuleSection(guildId, MODULE, current => normalizeSection(typeof updater === 'function' ? updater(clone(normalizeSection(current))) : updater), defaultSection(), meta));
}
function setEnabled(guildId, enabled, meta = {}) { return updateSection(guildId, section => ({ ...section, enabled: Boolean(enabled), updatedAt: now() }), meta); }
function listPanels(guildId) { return Object.values(getSection(guildId).panels || {}); }
function getPanel(guildId, panelId) { return getSection(guildId).panels?.[cleanKey(panelId)] || null; }
function savePanel(guildId, panel, meta = {}) {
  const normalized = normalizePanel(panel);
  return updateSection(guildId, section => ({ ...section, panels: { ...section.panels, [normalized.panelId]: { ...(section.panels?.[normalized.panelId] || {}), ...normalized } }, updatedAt: now() }), meta).panels[normalized.panelId];
}
function deletePanel(guildId, panelId, meta = {}) {
  const key = cleanKey(panelId);
  return updateSection(guildId, section => { const panels = { ...section.panels }; delete panels[key]; return { ...section, panels, updatedAt: now() }; }, meta);
}
function addAnalytics(guildId, patch = {}) {
  return updateSection(guildId, section => ({ ...section, analytics: Object.fromEntries(Object.entries({ ...section.analytics, ...patch }).map(([key, value]) => [key, typeof value === 'number' && key in section.analytics ? (section.analytics[key] || 0) + value : value])), updatedAt: now() }));
}

function parseMessageTarget(value, fallbackChannelId = null) {
  const raw = cleanString(value, '', 400);
  const link = raw.match(/discord(?:app)?\.com\/channels\/(\d{15,25})\/(\d{15,25})\/(\d{15,25})/i);
  if (link) return { guildId: link[1], channelId: link[2], messageId: link[3], messageUrl: raw };
  const messageId = cleanId(raw);
  return { guildId: null, channelId: cleanId(fallbackChannelId), messageId, messageUrl: null };
}

async function fetchMessage(guild, channelId, messageId) {
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.messages?.fetch) throw new Error('The selected channel is not accessible or does not support messages.');
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) throw new Error('The message could not be found in that channel.');
  return message;
}

async function validateMapping(guild, mapping) {
  const normalized = normalizeMapping(mapping);
  if (!normalized.roleId) throw new Error('Each mapping requires a valid role ID.');
  if (!normalized.emoji) throw new Error('Each mapping requires an emoji.');
  const role = guild.roles.cache.get(normalized.roleId) || await guild.roles.fetch(normalized.roleId).catch(() => null);
  if (!role) throw new Error(`Role ${normalized.roleId} could not be found.`);
  const safety = await canManageRole(guild, role.id);
  if (!safety.ok) throw new Error(safety.message || `Goliath cannot manage ${role.name}.`);
  normalized.label = role.name;
  return normalized;
}

async function attachExistingMessage({ guild, target, channelId, mappings = [], actorId }) {
  const parsed = parseMessageTarget(target, channelId);
  if (parsed.guildId && parsed.guildId !== guild.id) throw new Error('The message link belongs to a different server.');
  if (!parsed.channelId || !parsed.messageId) throw new Error('Provide a Discord message link, or provide both a channel ID and message ID.');
  const message = await fetchMessage(guild, parsed.channelId, parsed.messageId);
  const validated = [];
  for (const mapping of mappings) validated.push(await validateMapping(guild, mapping));
  if (!validated.length) throw new Error('Add at least one emoji-to-role mapping.');
  const existing = listPanels(guild.id).find(panel => panel.messageId === message.id);
  const panel = savePanel(guild.id, {
    ...(existing || {}),
    panelId: existing?.panelId || `existing-${message.id}`,
    source: 'existing',
    channelId: message.channelId,
    messageId: message.id,
    messageUrl: parsed.messageUrl || message.url,
    mappings: validated,
    createdBy: actorId,
    lastError: null,
  }, guild);
  await syncPanel(guild, panel.panelId);
  addAnalytics(guild.id, { attached: 1 });
  return getPanel(guild.id, panel.panelId);
}

async function syncPanel(guild, panelId) {
  const panel = getPanel(guild.id, panelId);
  if (!panel) throw new Error('Reaction role panel was not found.');
  const message = await fetchMessage(guild, panel.channelId, panel.messageId);
  for (const mapping of panel.mappings.filter(item => item.enabled !== false)) {
    await message.react(mapping.emoji).catch(error => { throw new Error(`Could not add reaction ${mapping.emoji}: ${error.message}`); });
  }
  savePanel(guild.id, { ...panel, lastSyncedAt: now(), lastError: null }, guild);
  addAnalytics(guild.id, { synced: 1 });
  return getPanel(guild.id, panelId);
}

async function detachPanel(guild, panelId, removeReactions = false) {
  const panel = getPanel(guild.id, panelId);
  if (!panel) return null;
  if (removeReactions) {
    const message = await fetchMessage(guild, panel.channelId, panel.messageId).catch(() => null);
    if (message) {
      for (const mapping of panel.mappings) {
        const reaction = message.reactions.cache.find(item => reactionKey(item.emoji) === emojiKey(mapping.emoji));
        if (reaction) await reaction.users.remove(guild.members.me?.id).catch(() => null);
      }
    }
  }
  deletePanel(guild.id, panelId, guild);
  return panel;
}

function findMapping(guildId, messageId, emoji) {
  const panel = listPanels(guildId).find(item => item.enabled !== false && item.messageId === messageId);
  if (!panel) return null;
  const key = reactionKey(emoji);
  const mapping = panel.mappings.find(item => item.enabled !== false && emojiKey(item.emoji) === key);
  return mapping ? { panel, mapping } : null;
}

async function applyReaction(reaction, user, added) {
  if (!user || user.bot) return null;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (reaction.message?.partial) await reaction.message.fetch().catch(() => null);
  const guild = reaction.message?.guild;
  if (!guild || !getSection(guild.id).enabled) return null;
  const found = findMapping(guild.id, reaction.message.id, reaction.emoji);
  if (!found) return null;
  const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
  if (!member) return null;
  const role = guild.roles.cache.get(found.mapping.roleId) || await guild.roles.fetch(found.mapping.roleId).catch(() => null);
  const safety = await canManageRole(guild, role?.id);
  if (!role || !safety.ok) { addAnalytics(guild.id, { failed: 1 }); return null; }
  try {
    if (added) {
      if (found.mapping.mode === MODES.REMOVE) await member.roles.remove(role, 'Goliath reaction role');
      else await member.roles.add(role, 'Goliath reaction role');
      addAnalytics(guild.id, found.mapping.mode === MODES.REMOVE ? { removed: 1 } : { assigned: 1 });
    } else if (found.mapping.removeOnUnreact !== false && found.mapping.mode === MODES.TOGGLE) {
      await member.roles.remove(role, 'Goliath reaction role removed');
      addAnalytics(guild.id, { removed: 1 });
    }
    return { ok: true, panelId: found.panel.panelId, roleId: role.id };
  } catch {
    addAnalytics(guild.id, { failed: 1 });
    return null;
  }
}

async function buildHealthReport(guild) {
  const panels = listPanels(guild.id);
  const results = [];
  for (const panel of panels) {
    let status = 'healthy';
    let messageExists = true;
    try { await fetchMessage(guild, panel.channelId, panel.messageId); } catch { status = 'missing'; messageExists = false; }
    const invalidRoles = [];
    for (const mapping of panel.mappings) {
      const role = guild.roles.cache.get(mapping.roleId) || await guild.roles.fetch(mapping.roleId).catch(() => null);
      if (!role) invalidRoles.push(mapping.roleId);
    }
    if (invalidRoles.length) status = 'warning';
    results.push({ panelId: panel.panelId, status, messageExists, invalidRoles });
  }
  return { healthy: results.every(item => item.status === 'healthy'), panelCount: panels.length, results };
}

function exportConfiguration(guildId) { return getSection(guildId); }
function reset(guildId, meta = {}) { return saveSection(guildId, defaultSection(), meta); }
async function startupReactionRoles(client) {
  for (const guild of client.guilds.cache.values()) {
    const section = getSection(guild.id);
    for (const panel of Object.values(section.panels || {})) {
      if (panel.enabled !== false) await syncPanel(guild, panel.panelId).catch(() => null);
    }
  }
}

module.exports = {
  MODES,
  defaultSection,
  getSection,
  setEnabled,
  listPanels,
  getPanel,
  savePanel,
  deletePanel,
  parseMessageTarget,
  attachExistingMessage,
  syncPanel,
  detachPanel,
  handleReactionAdd: (reaction, user) => applyReaction(reaction, user, true),
  handleReactionRemove: (reaction, user) => applyReaction(reaction, user, false),
  buildHealthReport,
  exportConfiguration,
  reset,
  startupReactionRoles,
};
'''

panel = r'''\
'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const reactionRoles = require('./reactionRoles');

const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

async function buildReactionRolesPanel(guild, memberDisplayName = 'Unknown User') {
  const section = reactionRoles.getSection(guild.id);
  const health = await reactionRoles.buildHealthReport(guild);
  const embed = new EmbedBuilder()
    .setColor(health.healthy ? 0x57f287 : 0xfaa61a)
    .setTitle('😊 Reaction Roles')
    .setDescription([
      `**Status:** ${section.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Attached Messages:** \`${health.panelCount}\``,
      `**Health:** ${health.healthy ? 'Healthy ✅' : 'Needs attention ⚠️'}`,
      '',
      'Use the dashboard to attach Reaction Roles to any existing Discord message or embed using its message link or ID.',
      'Goliath does not edit or replace the original message.',
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();
  return { embeds: [embed], components: [row(
    button(section.enabled ? 'admin:reactionRoles:disable' : 'admin:reactionRoles:enable', section.enabled ? '⏸️ Disable' : '▶️ Enable', section.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
    button('admin:reactionRoles:repair', '🩺 Re-sync', ButtonStyle.Primary),
    button('admin:modules', '⬅️ Modules')
  )] };
}

async function handleReactionRolesInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith('admin:reactionRoles')) return false;
  try {
    if (id.endsWith(':enable')) reactionRoles.setEnabled(interaction.guild.id, true, interaction.guild);
    if (id.endsWith(':disable')) reactionRoles.setEnabled(interaction.guild.id, false, interaction.guild);
    if (id.endsWith(':repair')) {
      await interaction.deferUpdate();
      for (const panel of reactionRoles.listPanels(interaction.guild.id)) await reactionRoles.syncPanel(interaction.guild, panel.panelId).catch(() => null);
    }
    const payload = await buildReactionRolesPanel(interaction.guild, interaction.member?.displayName || interaction.user?.username);
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload); else await interaction.update(payload);
    return true;
  } catch (error) {
    const payload = { content: `❌ Reaction Roles failed: ${error.message}`, flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null); else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildReactionRolesPanel,
  handleReactionRolesInteraction,
  buildReactionRolesAdminPanel: buildReactionRolesPanel,
  handleReactionRolesAdminInteraction: handleReactionRolesInteraction,
};
'''

route = r'''\
'use strict';

const express = require('express');
const reactionRoles = require('./reactionRoles');
const router = express.Router();

function guildId(req) { const id = String(req.params.guildId || ''); if (!/^\d{15,25}$/.test(id)) throw new Error('Invalid guild ID.'); return id; }
function client(req) { return req.client || req.app?.get?.('goliath.client') || null; }
async function guild(req, id) { const c = client(req); const found = c?.guilds?.cache?.get(id) || await c?.guilds?.fetch?.(id).catch(() => null); if (!found) throw new Error('Guild is unavailable.'); return found; }
function actor(req) { return String(req.session?.user?.id || req.body?.actorId || '') || null; }
function ok(res, payload = {}) { return res.json({ success: true, ...payload }); }
function fail(res, error, status = 400) { console.error('[Reaction Roles API]', error); return res.status(status).json({ success: false, error: error.message }); }

router.get('/:guildId/overview', async (req, res) => {
  try { const id = guildId(req); const g = await guild(req, id); return ok(res, { config: reactionRoles.getSection(id), health: await reactionRoles.buildHealthReport(g) }); } catch (error) { return fail(res, error); }
});
router.patch('/:guildId/enabled', (req, res) => {
  try { const id = guildId(req); return ok(res, { config: reactionRoles.setEnabled(id, req.body?.enabled === true, { actorId: actor(req) }) }); } catch (error) { return fail(res, error); }
});
router.post('/:guildId/attach', async (req, res) => {
  try { const id = guildId(req); const g = await guild(req, id); const panel = await reactionRoles.attachExistingMessage({ guild: g, target: req.body?.messageLink || req.body?.messageId, channelId: req.body?.channelId, mappings: req.body?.mappings, actorId: actor(req) }); return ok(res, { panel, config: reactionRoles.getSection(id) }); } catch (error) { return fail(res, error); }
});
router.put('/:guildId/panels/:panelId', async (req, res) => {
  try { const id = guildId(req); const g = await guild(req, id); const current = reactionRoles.getPanel(id, req.params.panelId); if (!current) throw new Error('Panel not found.'); const mappings = []; for (const mapping of req.body?.mappings || []) mappings.push(await reactionRoles.attachExistingMessage); const panel = reactionRoles.savePanel(id, { ...current, ...req.body, panelId: current.panelId }, g); await reactionRoles.syncPanel(g, panel.panelId); return ok(res, { panel }); } catch (error) { return fail(res, error); }
});
router.post('/:guildId/panels/:panelId/sync', async (req, res) => {
  try { const id = guildId(req); const g = await guild(req, id); return ok(res, { panel: await reactionRoles.syncPanel(g, req.params.panelId) }); } catch (error) { return fail(res, error); }
});
router.delete('/:guildId/panels/:panelId', async (req, res) => {
  try { const id = guildId(req); const g = await guild(req, id); const panel = await reactionRoles.detachPanel(g, req.params.panelId, req.query.removeReactions === 'true'); return ok(res, { panel, config: reactionRoles.getSection(id) }); } catch (error) { return fail(res, error); }
});
router.post('/:guildId/reset', (req, res) => { try { const id = guildId(req); return ok(res, { config: reactionRoles.reset(id, { actorId: actor(req) }) }); } catch (error) { return fail(res, error); } });
router.get('/:guildId/export', (req, res) => { try { const id = guildId(req); res.setHeader('Content-Type', 'application/json'); res.setHeader('Content-Disposition', `attachment; filename="goliath-reaction-roles-${id}.json"`); return res.send(JSON.stringify(reactionRoles.exportConfiguration(id), null, 2)); } catch (error) { return fail(res, error); } });

module.exports = router;
'''

# Fix the mistaken PUT route after constructing the source.
route = route.replace("const mappings = []; for (const mapping of req.body?.mappings || []) mappings.push(await reactionRoles.attachExistingMessage); ", "")

write('src/modules/reactionroles/reactionRoles.js', reaction_roles)
write('src/modules/reactionroles/reactionRolesPanel.js', panel)
write('src/modules/reactionroles/reactionRolesRoute.js', route)

# Move runtime imports to the dedicated module.
replace('src/events/messages/messageReactionAdd.js', "require('../../modules/roles/reactionRoleHandler')", "require('../../modules/reactionroles/reactionRoles')")
replace('src/events/messages/messageReactionAdd.js', "isModuleEnabled(guildId, 'roles')", "isModuleEnabled(guildId, 'reactionRoles')")
replace('src/events/messages/messageReactionRemove.js', "require('../../modules/roles/reactionRoleHandler')", "require('../../modules/reactionroles/reactionRoles')")
replace('src/events/messages/messageReactionRemove.js', "isModuleEnabled(guildId, 'roles')", "isModuleEnabled(guildId, 'reactionRoles')")

# Admin panel import.
for path in ['src/events/interactions/interactionCreate.js', 'src/core/admin/functions/moduleAdminPanels.js', 'src/core/admin/functions/adminRegisteredModulePayloads.js']:
    p = root / path
    if p.exists():
        text = p.read_text(encoding='utf-8')
        text = text.replace("../../core/admin/functions/reactionRolesAdminPanel", "../../modules/reactionroles/reactionRolesPanel")
        text = text.replace("./reactionRolesAdminPanel", "../../../modules/reactionroles/reactionRolesPanel")
        text = text.replace("require('./reactionRolesAdminPanel')", "require('../../../modules/reactionroles/reactionRolesPanel')")
        p.write_text(text, encoding='utf-8')

# Mount API route.
server = root / 'server.js'
text = server.read_text(encoding='utf-8')
if "reaction roles routes" not in text:
    text = text.replace("const verificationRoutes =", "const reactionRolesRoutes = safeRequire('reaction roles routes', './src/modules/reactionroles/reactionRolesRoute', emptyRouter(), { optional: false });\nconst verificationRoutes =")
if "app.use('/api/reaction-roles'" not in text:
    text = text.replace("app.use('/api/verification', verificationRoutes);", "app.use('/api/reaction-roles', reactionRolesRoutes);\napp.use('/api/verification', verificationRoutes);")
if "Reaction Roles" not in text:
    text = text.replace("runStartupTask('Verification'", "runStartupTask('Reaction Roles', () => require('./src/modules/reactionroles/reactionRoles').startupReactionRoles(client)),\n    runStartupTask('Verification'")
server.write_text(text, encoding='utf-8')

# Dashboard API methods.
api = root / 'src/dashboard/js/services/apiClient.js'
text = api.read_text(encoding='utf-8')
needle = "  getVerification: (guildId) => request(`/api/modules/${guildId}/verification`),"
methods = "  getReactionRolesOverview: (guildId) => request(`/api/reaction-roles/${guildId}/overview`),\n  setReactionRolesEnabled: (guildId, enabled) => request(`/api/reaction-roles/${guildId}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),\n  attachReactionRolesMessage: (guildId, payload) => request(`/api/reaction-roles/${guildId}/attach`, { method: 'POST', body: JSON.stringify(payload) }),\n  syncReactionRolesPanel: (guildId, panelId) => request(`/api/reaction-roles/${guildId}/panels/${encodeURIComponent(panelId)}/sync`, { method: 'POST' }),\n  detachReactionRolesPanel: (guildId, panelId, removeReactions = false) => request(`/api/reaction-roles/${guildId}/panels/${encodeURIComponent(panelId)}?removeReactions=${removeReactions}`, { method: 'DELETE' }),\n  getReactionRolesExportUrl: (guildId) => apiUrl(`/api/reaction-roles/${guildId}/export`),\n"
if 'getReactionRolesOverview' not in text:
    text = text.replace(needle, methods + needle)
api.write_text(text, encoding='utf-8')

# Dashboard page: focused production UI.
page = r'''\
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/apiClient.js';
import PageShell, { SectionCard, EmptyState, LoadingPanel, Notice, SecondaryButton, StatGrid, SummaryStat } from '../../shared/PageShell';

const field = { width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,.35)', background: 'rgba(15,23,42,.45)', color: 'inherit' };
function guildId(selectedGuild, data) { return String(data?.guildId || data?.id || selectedGuild || '').split(':').pop().trim(); }

export default function ReactionRoles({ theme, selectedGuild, selectedGuildData }) {
  const id = guildId(selectedGuild, selectedGuildData);
  const [config, setConfig] = useState({ enabled: false, panels: {}, analytics: {} });
  const [health, setHealth] = useState({ healthy: true, results: [] });
  const [roles, setRoles] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ channelId: '', messageLink: '', emoji: '⭐', roleId: '', mode: 'toggle', removeOnUnreact: true });
  const panels = useMemo(() => Object.values(config.panels || {}), [config]);

  async function load() {
    if (!id) return;
    setLoading(true); setError('');
    try {
      const [overview, rolePayload, channelPayload] = await Promise.all([api.getReactionRolesOverview(id), api.getGuildRoles(id), api.getGuildChannels(id)]);
      setConfig(overview.config || {}); setHealth(overview.health || {});
      setRoles(rolePayload.roles || rolePayload || []); setChannels(channelPayload.channels || channelPayload || []);
    } catch (e) { setError(e.message || 'Failed to load Reaction Roles.'); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [id]);

  async function attach(event) {
    event.preventDefault(); setLoading(true); setError(''); setNotice('');
    try {
      await api.attachReactionRolesMessage(id, { channelId: form.channelId || null, messageLink: form.messageLink, mappings: [{ emoji: form.emoji, roleId: form.roleId, mode: form.mode, removeOnUnreact: form.removeOnUnreact }] });
      setNotice('Reaction Roles attached to the existing message without changing its content.'); await load();
    } catch (e) { setError(e.message || 'Failed to attach message.'); } finally { setLoading(false); }
  }

  if (!id) return <PageShell title="Reaction Roles" subtitle="Attach roles to any Discord message." theme={theme}><EmptyState theme={theme} text="Select a server." /></PageShell>;
  return <PageShell title="Reaction Roles" subtitle="Attach emoji role mappings to any existing message or embed." theme={theme} guild={{ id, name: 'Reaction Roles' }} actions={<SecondaryButton theme={theme} disabled={loading} onClick={async () => { await api.setReactionRolesEnabled(id, !config.enabled); await load(); }}>{config.enabled ? 'Disable' : 'Enable'}</SecondaryButton>}>
    {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
    {notice ? <Notice theme={theme} tone="success">{notice}</Notice> : null}
    {loading ? <LoadingPanel theme={theme} text="Updating Reaction Roles..." /> : null}
    <StatGrid><SummaryStat theme={theme} label="Status" value={config.enabled ? 'Enabled' : 'Disabled'} /><SummaryStat theme={theme} label="Messages" value={panels.length} /><SummaryStat theme={theme} label="Assigned" value={config.analytics?.assigned || 0} /><SummaryStat theme={theme} label="Removed" value={config.analytics?.removed || 0} /></StatGrid>
    <SectionCard theme={theme} title="Attach to Existing Message" subtitle="Paste a Discord message link, or select a channel and paste only the message ID. The original message is never edited.">
      <form onSubmit={attach} style={{ display: 'grid', gap: 12 }}>
        <label>Message link or ID<input style={field} value={form.messageLink} onChange={e => setForm({ ...form, messageLink: e.target.value })} placeholder="https://discord.com/channels/.../.../... or message ID" required /></label>
        <label>Channel (required only when using a message ID)<select style={field} value={form.channelId} onChange={e => setForm({ ...form, channelId: e.target.value })}><option value="">Use channel from message link</option>{channels.map(c => <option key={c.id} value={c.id}>#{c.name || c.id}</option>)}</select></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, .5fr) 2fr 1fr', gap: 12 }}>
          <label>Emoji<input style={field} value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} required /></label>
          <label>Role<select style={field} value={form.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })} required><option value="">Select role</option>{roles.map(r => <option key={r.id} value={r.id}>{r.name || r.id}</option>)}</select></label>
          <label>Mode<select style={field} value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}><option value="toggle">Add/remove</option><option value="add">Add only</option><option value="remove">Remove role</option></select></label>
        </div>
        <label><input type="checkbox" checked={form.removeOnUnreact} onChange={e => setForm({ ...form, removeOnUnreact: e.target.checked })} /> Remove role when reaction is removed</label>
        <SecondaryButton theme={theme} type="submit" disabled={loading}>Attach Reaction Role</SecondaryButton>
      </form>
    </SectionCard>
    <SectionCard theme={theme} title="Attached Messages" subtitle="Re-sync missing reactions or detach functionality without deleting the original message.">
      <div style={{ display: 'grid', gap: 12 }}>{panels.length ? panels.map(panel => <div key={panel.panelId} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 14, display: 'grid', gap: 8 }}><strong>{panel.title || panel.panelId}</strong><div>Channel: {panel.channelId} · Message: {panel.messageId}</div><div>{(panel.mappings || []).map(m => `${m.emoji} → ${m.label || m.roleId}`).join(' · ')}</div><div style={{ display: 'flex', gap: 8 }}><SecondaryButton theme={theme} onClick={async () => { await api.syncReactionRolesPanel(id, panel.panelId); await load(); }}>Re-sync</SecondaryButton><SecondaryButton theme={theme} onClick={async () => { await api.detachReactionRolesPanel(id, panel.panelId, false); await load(); }}>Detach</SecondaryButton></div></div>) : <EmptyState theme={theme} text="No messages attached yet." />}</div>
    </SectionCard>
  </PageShell>;
}
'''
write('src/dashboard/js/pages/modules/ReactionRoles.jsx', page)

# Doctor registry and runtime target.
goliath = root / 'scripts/goliath.js'
text = goliath.read_text(encoding='utf-8')
if "name: 'Reaction Roles'" not in text:
    marker = "  {\n    name: 'Welcome',"
    block = "  {\n    name: 'Reaction Roles',\n    files: [\n      ['src/modules/reactionroles/reactionRoles.js', ['getSection', 'attachExistingMessage', 'handleReactionAdd', 'handleReactionRemove', 'buildHealthReport', 'startupReactionRoles']],\n      ['src/modules/reactionroles/reactionRolesPanel.js', ['buildReactionRolesPanel', 'handleReactionRolesInteraction']],\n      ['src/modules/reactionroles/reactionRolesRoute.js'],\n      ['src/dashboard/js/pages/modules/ReactionRoles.jsx'],\n    ],\n  },\n"
    text = text.replace(marker, block + marker)
explicit_marker = "    'src/modules/verification/verification.js',"
if "src/modules/reactionroles/reactionRoles.js" not in text[text.find('function collectRuntimeTargets'):]:
    text = text.replace(explicit_marker, "    'src/modules/reactionroles/reactionRoles.js',\n    'src/modules/reactionroles/reactionRolesPanel.js',\n    'src/modules/reactionroles/reactionRolesRoute.js',\n" + explicit_marker)
goliath.write_text(text, encoding='utf-8')

# Mark module complete in manifest.
manifest = root / 'src/core/modules/moduleManifest.js'
text = manifest.read_text(encoding='utf-8')
text = text.replace("reactionRoles: { key: 'reactionRoles', name: 'Reaction Roles', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() }", "reactionRoles: { key: 'reactionRoles', name: 'Reaction Roles', maturity: MODULE_MATURITY.COMPLETE, capabilities: completeCapabilities() }")
manifest.write_text(text, encoding='utf-8')

# Remove superseded legacy files.
for old in ['src/modules/roles/reactionRoleHandler.js', 'src/core/admin/functions/reactionRolesAdminPanel.js']:
    p = root / old
    if p.exists(): p.unlink()

# Self-remove.
self_path = root / 'scripts/build-reaction-roles.ps1'
if self_path.exists(): self_path.unlink()
'@ | python -

$checks = @(
  'src/modules/reactionroles/reactionRoles.js',
  'src/modules/reactionroles/reactionRolesPanel.js',
  'src/modules/reactionroles/reactionRolesRoute.js',
  'server.js',
  'src/events/messages/messageReactionAdd.js',
  'src/events/messages/messageReactionRemove.js',
  'scripts/goliath.js'
)
foreach ($file in $checks) { node --check $file }
npm run doctor
npm run build

git add -A
git commit -m 'feat: build Reaction Roles module with existing message attachment'
git push origin dev
Write-Host 'Reaction Roles module complete.' -ForegroundColor Green
