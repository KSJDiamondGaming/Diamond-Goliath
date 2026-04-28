const express = require('express');
const guildStore = require('../../../src/core/guild/store');
const { emitGuildUpdate } = require('../sockets/socketHub');

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
    .filter((c) => String(c?.action || '').toLowerCase() === 'warn')
    .map((w) => ({
      ...w,
      guildId: w?.guildId || guildId,
    }))
    .sort((a, b) => Number(b?.caseNumber || 0) - Number(a?.caseNumber || 0));
}

function findCaseKey(cases, caseNumber) {
  if (cases[caseNumber]) return caseNumber;

  return Object.keys(cases).find((key) => {
    const entry = cases[key];
    return String(entry?.caseNumber || entry?.id || key) === String(caseNumber);
  });
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

/* ================= CLEAR CASE ================= */

router.post('/:guildId/:caseNumber/clear', (req, res) => {
  try {
    const { guildId, caseNumber } = req.params;
    const cases = guildStore.getGuildSection(guildId, 'cases', {});
    const caseKey = findCaseKey(cases, caseNumber);

    if (!caseKey) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const updated = {
      ...cases,
      [caseKey]: {
        ...cases[caseKey],
        cleared: true,
        clearedAt: new Date().toISOString(),
      },
    };

    guildStore.saveGuildSection(guildId, 'cases', updated);

    emitGuildUpdate(guildId, {
      section: 'cases',
      data: updated,
    });

    return res.json({
      ok: true,
      guildId,
      caseNumber,
      case: updated[caseKey],
      cases: updated,
    });
  } catch (err) {
    console.error('Clear case failed:', err);
    return res.status(500).json({ error: 'Failed to clear case' });
  }
});

module.exports = router;