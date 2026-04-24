const express = require('express');
const path = require('path');
const { read, write } = require('../utils/fileStore');

const router = express.Router();

// ✅ FIXED PATH (shared system)
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

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const cases = getCasesData();
    return res.json(cases[guildId] || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load cases' });
  }
});

router.get('/:guildId/list', (req, res) => {
  try {
    const { guildId } = req.params;
    const cases = getCasesData();
    const list = normalizeGuildCases(cases[guildId] || {}, guildId);
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load case list' });
  }
});

module.exports = router;