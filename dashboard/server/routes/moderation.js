const express = require('express');
const guildStore = require('../../../src/core/guild/store');

const router = express.Router();

function normalizeGuildCases(guildCases, guildId) {
  if (!guildCases || typeof guildCases !== 'object') return [];

  return Object.values(guildCases)
    .map((c) => ({
      ...c,
      guildId: c?.guildId || guildId,
    }))
    .sort((a, b) => Number(b?.caseNumber || 0) - Number(a?.caseNumber || 0));
}

function getGuildWarnings(guildCases, guildId) {
  if (!guildCases || typeof guildCases !== 'object') return [];

  return Object.values(guildCases)
    .filter((c) => c?.action === 'Warn')
    .map((w) => ({
      ...w,
      guildId: w?.guildId || guildId,
    }))
    .sort((a, b) => Number(b?.caseNumber || 0) - Number(a?.caseNumber || 0));
}

/* ================= RAW CASES ================= */

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const cases = guildStore.getGuildSection(guildId, 'cases', {});

    return res.json(cases);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load cases' });
  }
});

/* ================= SORTED CASE LIST ================= */

router.get('/:guildId/list', (req, res) => {
  try {
    const { guildId } = req.params;
    const cases = guildStore.getGuildSection(guildId, 'cases', {});

    const list = normalizeGuildCases(cases, guildId);
    return res.json(list);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load case list' });
  }
});

/* ================= WARNINGS ================= */

router.get('/:guildId/warnings', (req, res) => {
  try {
    const { guildId } = req.params;
    const cases = guildStore.getGuildSection(guildId, 'cases', {});

    const warnings = getGuildWarnings(cases, guildId);
    return res.json(warnings);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load warnings' });
  }
});

module.exports = router;