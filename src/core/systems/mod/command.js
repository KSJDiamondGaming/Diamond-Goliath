'use strict';

const express = require('express');
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { enforceCommandAccess } = require('../../commands/commandAccess');
const { errorEmbed } = require('../../ui/embeds');
const { safeEditReply } = require('../../ui/interactionResponse');
const { openModPanel } = require('./panel');
const {
  getWarningsForUser,
  getWarningCountForUser,
  getAllCases,
  createCase,
  sendModLog,
} = require('./storage');

const ESCALATION_CONFIG = {
  2: { action: 'timeout', duration: '10m' },
  3: { action: 'timeout', duration: '1h' },
  4: { action: 'kick' },
  5: { action: 'ban', deleteDays: 0 },
};
const DURATION_UNITS = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};
const MOD_COMMAND_PERMISSIONS = PermissionFlagsBits.ModerateMembers | PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers;

function normalizeGuildId(guildId) {
  const id = String(guildId || '').trim();
  return /^\d{16,20}$/.test(id) ? id : null;
}

function getGuildCases(guildId) {
  const safeGuildId = normalizeGuildId(guildId);
  if (!safeGuildId) return {};
  return Object.fromEntries(
    (getAllCases(safeGuildId) || []).map((entry) => [String(entry.caseId), entry])
  );
}

function getGuildCaseEntries(guildCases, guildId) {
  if (!guildCases || typeof guildCases !== 'object' || Array.isArray(guildCases)) return [];
  return Object.values(guildCases)
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({ ...entry, guildId: entry.guildId || guildId }))
    .sort((a, b) => Number(b.caseId || 0) - Number(a.caseId || 0));
}

function getGuildWarnings(guildCases, guildId) {
  return getGuildCaseEntries(guildCases, guildId)
    .filter((entry) => String(entry.action || '').toLowerCase() === 'warn');
}

function createModerationRouter() {
  const router = express.Router();

  router.get('/:guildId', (req, res) => {
    try {
      const guildId = normalizeGuildId(req.params.guildId);
      if (!guildId) return res.status(400).json({ error: 'Missing or invalid guild ID.' });
      return res.json(getGuildCases(guildId));
    } catch (error) {
      console.error('Failed to load cases:', error);
      return res.status(500).json({ error: 'Failed to load cases', message: error.message });
    }
  });

  router.get('/:guildId/list', (req, res) => {
    try {
      const guildId = normalizeGuildId(req.params.guildId);
      if (!guildId) return res.status(400).json({ error: 'Missing or invalid guild ID.' });
      return res.json(getGuildCaseEntries(getGuildCases(guildId), guildId));
    } catch (error) {
      console.error('Failed to load case list:', error);
      return res.status(500).json({ error: 'Failed to load case list', message: error.message });
    }
  });

  router.get('/:guildId/warnings', (req, res) => {
    try {
      const guildId = normalizeGuildId(req.params.guildId);
      if (!guildId) return res.status(400).json({ error: 'Missing or invalid guild ID.' });
      return res.json(getGuildWarnings(getGuildCases(guildId), guildId));
    } catch (error) {
      console.error('Failed to load warnings:', error);
      return res.status(500).json({ error: 'Failed to load warnings', message: error.message });
    }
  });

  return router;
}

function getEscalationConfig() {
  return { ...ESCALATION_CONFIG };
}

function parseDuration(input) {
  const match = String(input || '').trim().toLowerCase().match(/^(\d+)(m|h|d)$/);
  if (!match) return null;
  return Number(match[1]) * DURATION_UNITS[match[2]];
}

function normalizeReason(reason) {
  return String(reason || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getRepeatReasonInfo(guildIdOrOptions, userId, reason) {
  const options = typeof guildIdOrOptions === 'object'
    ? guildIdOrOptions
    : { guildId: guildIdOrOptions, userId, reason };
  const warnings = getWarningsForUser(options.guildId, options.userId) || [];
  const normalizedReason = normalizeReason(options.reason);
  const matches = warnings.filter((entry) => normalizeReason(entry.reason) === normalizedReason);
  return { repeatCount: matches.length, isRepeatPattern: matches.length >= 2 };
}

function getNextEscalationPreview(guildId, userId) {
  const warningCount = getWarningCountForUser(guildId, userId);
  const nextWarningCount = warningCount + 1;
  const next = ESCALATION_CONFIG[nextWarningCount];
  if (!next) return 'No automatic escalation configured';
  if (next.action === 'timeout') return `Timeout (${next.duration}) at ${nextWarningCount} warnings`;
  if (next.action === 'kick') return `Kick at ${nextWarningCount} warnings`;
  if (next.action === 'ban') return `Ban at ${nextWarningCount} warnings`;
  return `Escalation at ${nextWarningCount} warnings`;
}

function buildEscalationReason(escalation, warningCount, reason) {
  const baseReason = escalation.repeatTriggered
    ? 'Auto escalation (repeat behavior detected)'
    : `Auto escalation (${warningCount} warnings)`;
  return `${baseReason}${reason ? ` | ${reason}` : ''}`.slice(0, 512);
}

async function createEscalationCase({ guild, member, moderator, action, reason, metadata = {} }) {
  return createCase({
    guildId: guild.id,
    userId: member.id,
    moderatorId: moderator.id,
    action,
    reason,
    metadata: { auto: true, ...metadata },
  });
}

async function logEscalation({ guild, member, moderator, actionLabel, reason, caseId, metadata = {} }) {
  return sendModLog({ guild, target: member, moderator, action: actionLabel, reason, caseId, metadata });
}

async function applyTimeout({ guild, member, moderator, escalation, finalReason }) {
  const durationMs = parseDuration(escalation.duration);
  if (!durationMs) return null;
  await member.timeout(durationMs, finalReason);
  const metadata = { duration: escalation.duration, repeatTriggered: Boolean(escalation.repeatTriggered) };
  const modCase = await createEscalationCase({ guild, member, moderator, action: 'timeout', reason: finalReason, metadata });
  await logEscalation({ guild, member, moderator, actionLabel: 'Auto Timeout', reason: finalReason, caseId: modCase.caseId, metadata });
  return modCase;
}

async function applyKick({ guild, member, moderator, escalation, finalReason }) {
  await member.kick(finalReason);
  const metadata = { repeatTriggered: Boolean(escalation.repeatTriggered) };
  const modCase = await createEscalationCase({ guild, member, moderator, action: 'kick', reason: finalReason, metadata });
  await logEscalation({ guild, member, moderator, actionLabel: 'Auto Kick', reason: finalReason, caseId: modCase.caseId, metadata });
  return modCase;
}

async function applyBan({ guild, member, moderator, escalation, finalReason }) {
  const rawDeleteDays = Number(escalation.deleteDays);
  const deleteDays = Number.isFinite(rawDeleteDays) ? Math.min(7, Math.max(0, Math.trunc(rawDeleteDays))) : 0;
  await member.ban({ deleteMessageSeconds: deleteDays * 24 * 60 * 60, reason: finalReason });
  const metadata = { deleteDays, repeatTriggered: Boolean(escalation.repeatTriggered) };
  const modCase = await createEscalationCase({ guild, member, moderator, action: 'ban', reason: finalReason, metadata });
  await logEscalation({ guild, member, moderator, actionLabel: 'Auto Ban', reason: finalReason, caseId: modCase.caseId, metadata });
  return modCase;
}

async function handleEscalation({ guild, member, moderator, reason }) {
  if (!guild || !member || !moderator) return null;
  const warningCount = getWarningCountForUser(guild.id, member.id);
  const repeatInfo = getRepeatReasonInfo(guild.id, member.id, reason);
  let escalation = ESCALATION_CONFIG[warningCount];
  if (!escalation && repeatInfo.isRepeatPattern) {
    escalation = { action: 'timeout', duration: '10m', repeatTriggered: true };
  }
  if (!escalation) return null;
  const finalReason = buildEscalationReason(escalation, warningCount, reason);
  try {
    if (escalation.action === 'timeout') return applyTimeout({ guild, member, moderator, escalation, finalReason });
    if (escalation.action === 'kick') return applyKick({ guild, member, moderator, escalation, finalReason });
    if (escalation.action === 'ban') return applyBan({ guild, member, moderator, escalation, finalReason });
    return null;
  } catch (error) {
    console.error('❌ Escalation error:', error);
    return null;
  }
}

const command = {
  category: 'Moderation',
  help: { name: 'mod', description: '🔐 Open moderation hub and staff tools.', usage: '/mod' },
  access: { level: 'mod', ownerOnly: false },
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('🔐 Open Goliath’s moderation hub and staff tools')
    .setDefaultMemberPermissions(MOD_COMMAND_PERMISSIONS),
  async execute(interaction) {
    const denied = await enforceCommandAccess(interaction, command);
    if (denied) return;
    try {
      if (!interaction.guild) {
        return safeEditReply(interaction, { embeds: [errorEmbed('This command can only be used inside a server.')] });
      }
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });
      return openModPanel(interaction);
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) return;
      console.error('❌ Mod command failed:', error);
      return safeEditReply(interaction, {
        embeds: [errorEmbed('Failed to open the moderation hub. Please try again.')],
        components: [],
      });
    }
  },
  router: createModerationRouter(),
  createModerationRouter,
  handleEscalation,
  getEscalationConfig,
  getNextEscalationPreview,
  getRepeatReasonInfo,
  parseDuration,
  normalizeReason,
};

module.exports = command;
