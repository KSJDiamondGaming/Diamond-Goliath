const express = require('express');
const path = require('path');
const { readJsonSafe } = require('../../guild/fileStore');

const router = express.Router();

const DATA_PATH = path.join(__dirname, '..', 'data');
const CASES_PATH = path.join(DATA_PATH, 'modCaseDetails.json');

function getCasesData() {
  return readJson(CASES_PATH, {});
}

function getGuildCaseEntries(guildCases, guildId) {
  if (!guildCases || typeof guildCases !== 'object' || Array.isArray(guildCases)) {
    return [];
  }

  return Object.values(guildCases)
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      ...entry,
      guildId: entry.guildId || guildId,
    }))
    .sort((a, b) => Number(b.caseNumber || 0) - Number(a.caseNumber || 0));
}

function getGuildCases(guildId) {
  const cases = getCasesData();
  return cases[guildId] && typeof cases[guildId] === 'object'
    ? cases[guildId]
    : {};
}

function getGuildWarnings(guildCases, guildId) {
  return getGuildCaseEntries(guildCases, guildId).filter(
    (entry) => String(entry.action || '').toLowerCase() === 'warn'
  );
}

/* ================= RAW CASES ================= */

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    return res.json(getGuildCases(guildId));
  } catch (error) {
    console.error('Failed to load cases:', error);
    return res.status(500).json({ error: 'Failed to load cases' });
  }
});

/* ================= SORTED CASE LIST ================= */

router.get('/:guildId/list', (req, res) => {
  try {
    const { guildId } = req.params;
    const guildCases = getGuildCases(guildId);
    const list = getGuildCaseEntries(guildCases, guildId);

    return res.json(list);
  } catch (error) {
    console.error('Failed to load case list:', error);
    return res.status(500).json({ error: 'Failed to load case list' });
  }
});

/* ================= WARNINGS ================= */

router.get('/:guildId/warnings', (req, res) => {
  try {
    const { guildId } = req.params;
    const guildCases = getGuildCases(guildId);
    const warnings = getGuildWarnings(guildCases, guildId);

    return res.json(warnings);
  } catch (error) {
    console.error('Failed to load warnings:', error);
    return res.status(500).json({ error: 'Failed to load warnings' });
  }
});

module.exports = router;