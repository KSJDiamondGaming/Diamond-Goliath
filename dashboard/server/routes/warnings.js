const express = require('express');
const path = require('path');
const readJson = require('../utils/readJson');

const router = express.Router();

const DATA_PATH = path.join(__dirname, '..', '..', '..', 'src', 'data');
const CASES_PATH = path.join(DATA_PATH, 'modCaseDetails.json');

function getCasesData() {
  return readJson(CASES_PATH, {});
}

function getGuildWarnings(guildId) {
  const cases = getCasesData();
  const guildCases = Object.values(cases[guildId] || {});

  return guildCases
    .filter((c) => c?.action === 'Warn')
    .map((w) => ({
      ...w,
      guildId: w?.guildId || guildId,
    }))
    .sort((a, b) => Number(b?.caseNumber || 0) - Number(a?.caseNumber || 0));
}

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const warnings = getGuildWarnings(guildId);
    res.json(warnings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load warnings' });
  }
});

module.exports = router;