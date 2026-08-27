'use strict';

const express = require('express');
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { enforceCommandAccess } = require('../../commands/commandAccess');
const { errorEmbed } = require('../../ui/embeds');
const { safeEditReply } = require('../../ui/interactionResponse');
const {
  handleEscalation,
  getEscalationConfig,
  getNextEscalationPreview,
  getRepeatReasonInfo,
  parseDuration,
  normalizeReason,
} = require('./warns');
const { openModPanel } = require('./panel');
const { getAllCases } = require('./storage');

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
