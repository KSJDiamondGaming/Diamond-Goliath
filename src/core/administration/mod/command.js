'use strict';

// Moderation panel layout contract: feature rows first; the final row is navigation,
// with Back first and Export immediately after it when export is available.
const express = require('express');
const { SlashCommandBuilder } = require('discord.js');
const { enforceCommandAccess } = require('../../commands/commandAccess');
const { errorEmbed } = require('../../ui/embeds');
const { safeEditReply } = require('../../ui/interactionResponse');
require('./caseManagementUx');
const { openModPanel } = require('./panel');
const { recordModerationSystemEvent, getModerationDoctorStatus } = require('./permissions');
const { db, getCaseById, getCasesForUser } = require('./storage');
const { getAppealEligibility, getCaseAppeals, submitAppeal } = require('./cases');

const router = express.Router();
const APPEALABLE_WEB_ACTIONS = new Set(['warn', 'timeout', 'kick', 'ban', 'case']);

function requireAppealSession(req, res, next) {
  const userId = String(req.session?.user?.id || '').trim();
  if (!/^\d{15,25}$/.test(userId)) return res.status(401).json({ error: 'Authentication required.' });
  req.appealUserId = userId;
  return next();
}

function getGuildName(req, guildId) {
  const guild = req.client?.guilds?.cache?.get?.(String(guildId));
  return guild?.name || `Server ${guildId}`;
}

function safeAppeal(appeal = {}) {
  return {
    id: String(appeal.id || ''),
    status: String(appeal.status || 'pending'),
    grounds: String(appeal.grounds || ''),
    requestedResolution: appeal.requestedResolution ? String(appeal.requestedResolution) : null,
    submittedAt: appeal.submittedAt || null,
    reviewedAt: appeal.reviewedAt || null,
    reviewNote: appeal.reviewNote ? String(appeal.reviewNote) : null,
    remedyDetail: appeal.remedy?.detail ? String(appeal.remedy.detail) : null,
  };
}

function safeAppealCase(req, modCase, userId) {
  const action = String(modCase.action || '').toLowerCase();
  if (!APPEALABLE_WEB_ACTIONS.has(action)) return null;

  const proceeding = modCase.metadata?.proceeding && typeof modCase.metadata.proceeding === 'object'
    ? modCase.metadata.proceeding
    : null;
  if (action === 'case' && (!proceeding?.publication || !proceeding?.decision)) return null;

  const appeals = getCaseAppeals(modCase).map(safeAppeal);
  const eligibility = getAppealEligibility(modCase, userId);
  if (!eligibility.ok && !appeals.length) return null;

  const effectiveAction = action === 'case'
    ? String(proceeding?.sanctionExecution?.action || proceeding?.decision?.action || 'case').toLowerCase()
    : action;
  const publicSummary = action === 'case'
    ? String(proceeding?.publication?.summary || proceeding?.decision?.summary || 'An official Case Proceedings decision was published.').slice(0, 1500)
    : String(modCase.reason || 'No reason provided.').slice(0, 1500);

  return {
    guildId: String(modCase.guildId),
    guildName: getGuildName(req, modCase.guildId),
    caseId: Number(modCase.caseId),
    action: effectiveAction,
    actionLabel: effectiveAction.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    status: String(modCase.status || 'active'),
    createdAt: modCase.createdAt || null,
    publicSummary,
    eligible: Boolean(eligibility.ok),
    eligibilityMessage: eligibility.ok ? null : String(eligibility.error || 'This case is not currently appealable.'),
    eligibleAt: eligibility.eligibleAt || null,
    appeals,
  };
}

router.get('/appeals/me', requireAppealSession, (req, res) => {
  try {
    const userId = req.appealUserId;
    const guildRows = db.prepare('SELECT DISTINCT guild_id FROM cases WHERE user_id = ? ORDER BY guild_id').all(userId);
    const records = [];
    for (const row of guildRows) {
      for (const modCase of getCasesForUser(String(row.guild_id), userId) || []) {
        const safe = safeAppealCase(req, modCase, userId);
        if (safe) records.push(safe);
      }
    }
    records.sort((a, b) => (new Date(b.createdAt || 0).getTime() || 0) - (new Date(a.createdAt || 0).getTime() || 0));
    return res.json({ ok: true, cases: records });
  } catch (error) {
    console.error('[Appeals API] Failed to load member cases:', error);
    return res.status(500).json({ error: 'Could not load your appeal records.' });
  }
});

router.post('/appeals/:guildId/:caseId', requireAppealSession, (req, res) => {
  try {
    const guildId = String(req.params.guildId || '').trim();
    const caseId = Number(req.params.caseId);
    const userId = req.appealUserId;
    if (!/^\d{15,25}$/.test(guildId) || !Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid appeal reference.' });

    const modCase = getCaseById(guildId, caseId);
    if (!modCase || String(modCase.userId) !== userId) return res.status(404).json({ error: 'This case is not available for appeal.' });

    const eligibility = getAppealEligibility(modCase, userId);
    if (!eligibility.ok) return res.status(409).json({ error: eligibility.error || 'This case is not currently appealable.', eligibleAt: eligibility.eligibleAt || null });

    const grounds = String(req.body?.grounds || '').trim();
    const requestedResolution = String(req.body?.requestedResolution || '').trim();
    if (!grounds) return res.status(400).json({ error: 'Appeal grounds are required.' });

    const result = submitAppeal(guildId, caseId, {
      appellantId: userId,
      grounds,
      requestedResolution,
      source: 'web',
    }, userId);
    if (!result.ok) return res.status(409).json({ error: result.error || 'Could not submit your appeal.' });

    return res.status(201).json({
      ok: true,
      appeal: safeAppeal(result.appeal),
      caseId,
      guildId,
    });
  } catch (error) {
    console.error('[Appeals API] Failed to submit appeal:', error);
    return res.status(500).json({ error: 'Could not submit your appeal.' });
  }
});

const command = {
  category: 'Moderation',
  help: { name: 'mod', description: '🔐 Open Goliath’s moderation hub and management tools.', usage: '/mod' },
  access: { level: 'mod', ownerOnly: false },
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('🔐 Open Goliath’s moderation hub and management tools'),
  async execute(interaction) {
    const denied = await enforceCommandAccess(interaction, command);
    if (denied) {
      recordModerationSystemEvent({ interaction, event: 'moderation.command.denied', action: 'view_dashboard', reason: 'Command access policy denied the moderation hub.' });
      return;
    }
    try {
      if (!interaction.guild) {
        recordModerationSystemEvent({ interaction, guildId: 'dm', event: 'moderation.command.invalid_context', action: 'view_dashboard', reason: 'Moderation panel requested outside a guild.' });
        return safeEditReply(interaction, { embeds: [errorEmbed('The moderation hub can only be used inside a server. Member appeals are submitted from `/user` → Account → Appeals.')] });
      }
      const doctor = getModerationDoctorStatus();
      if (!doctor.ok) recordModerationSystemEvent({ interaction, event: 'moderation.doctor.warning', action: 'view_dashboard', after: doctor });
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });
      return openModPanel(interaction);
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) return;
      console.error('❌ Mod command failed:', error);
      recordModerationSystemEvent({ interaction, event: 'moderation.command.failed', action: 'view_dashboard', reason: error?.message || error, metadata: { stack: String(error?.stack || '').slice(0, 1500) } });
      return safeEditReply(interaction, {
        embeds: [errorEmbed('Failed to open the moderation hub. Please try again.')],
        components: [],
      });
    }
  },
};

command.router = router;
module.exports = command;
