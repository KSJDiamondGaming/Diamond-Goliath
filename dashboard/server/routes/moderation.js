const express = require('express');
const path = require('path');
const { read: readJson } = require('../utils/fileStore');

const router = express.Router();

const DATA_PATH = path.join(__dirname, '..', 'data');
const CASES_PATH = path.join(DATA_PATH, 'modCaseDetails.json');

function getCasesData() {
  return readJson(CASES_PATH, {});
}

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
    const cases = getCasesData();

    return res.json(cases[guildId] || {});
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load cases' });
  }
});

/* ================= SORTED CASE LIST ================= */

router.get('/:guildId/list', (req, res) => {
  try {
    const { guildId } = req.params;
    const cases = getCasesData();

    const list = normalizeGuildCases(cases[guildId] || {}, guildId);
    return res.json(list);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load case list' });
  }
});

/* ================= WARNINGS (MERGED) ================= */

router.get('/:guildId/warnings', (req, res) => {
  try {
    const { guildId } = req.params;
    const cases = getCasesData();

    const warnings = getGuildWarnings(cases[guildId] || {}, guildId);
    return res.json(warnings);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load warnings' });
  }
});

module.exports = router;