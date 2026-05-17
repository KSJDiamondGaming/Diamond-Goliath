const fs = require('fs');
const path = require('path');
const express = require('express');

const router = express.Router();

/**
 * Moderation dashboard routes
 *
 * Mounted in server.js as:
 *   app.use('/api/cases', moderationRoutes);
 *
 * Endpoints:
 *   GET /api/cases/:guildId
 *   GET /api/cases/:guildId/list
 *   GET /api/cases/:guildId/warnings
 */

const POSSIBLE_CASE_PATHS = [
  // Current dashboard/data location
  path.join(__dirname, '..', 'data', 'modCaseDetails.json'),

  // Common root data location
  path.join(process.cwd(), 'src', 'data', 'modCaseDetails.json'),

  // Possible legacy bot data location
  path.join(process.cwd(), 'data', 'modCaseDetails.json'),

  // Possible moderation/cases location
  path.join(process.cwd(), 'src', 'moderation', 'modCaseDetails.json'),
];

function findExistingCasesPath() {
  for (const filePath of POSSIBLE_CASE_PATHS) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  // Default path if no file exists yet.
  return POSSIBLE_CASE_PATHS[0];
}

const CASES_PATH = findExistingCasesPath();

function readJsonSafe(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    const raw = fs.readFileSync(filePath, 'utf8');

    if (!raw || !raw.trim()) {
      return fallback;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return fallback;
    }

    return parsed;
  } catch (error) {
    console.warn(`⚠️ Failed to read JSON file: ${filePath}`);
    console.warn(error.message);

    return fallback;
  }
}

function normalizeAction(action) {
  return String(action || '').trim().toLowerCase();
}

function normalizeCaseEntry(entry, guildId, fallbackKey = null) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }

  const caseNumber =
    entry.caseNumber ||
    entry.case ||
    entry.id ||
    entry.caseId ||
    fallbackKey ||
    null;

  return {
    ...entry,
    id: entry.id || entry.caseId || String(caseNumber || fallbackKey || ''),
    caseId: entry.caseId || entry.id || String(caseNumber || fallbackKey || ''),
    caseNumber,
    guildId: entry.guildId || guildId,
    action: entry.action || entry.type || entry.reasonType || '',
    reason: entry.reason || '',
    userId: entry.userId || entry.targetId || entry.memberId || null,
    moderatorId: entry.moderatorId || entry.modId || entry.staffId || null,
    createdAt:
      entry.createdAt ||
      entry.timestamp ||
      entry.date ||
      entry.created ||
      null,
  };
}

function sortCasesNewestFirst(a, b) {
  const caseA = Number(a.caseNumber || 0);
  const caseB = Number(b.caseNumber || 0);

  if (caseA !== caseB) {
    return caseB - caseA;
  }

  const timeA = new Date(a.createdAt || 0).getTime();
  const timeB = new Date(b.createdAt || 0).getTime();

  return timeB - timeA;
}

function getCasesData() {
  return readJsonSafe(CASES_PATH, {});
}

function getGuildCasesRaw(guildId) {
  const allCases = getCasesData();

  if (!allCases || typeof allCases !== 'object') {
    return {};
  }

  const guildCases = allCases[guildId];

  if (!guildCases) {
    return {};
  }

  return guildCases;
}

function getGuildCaseEntries(guildCases, guildId) {
  if (!guildCases) {
    return [];
  }

  if (Array.isArray(guildCases)) {
    return guildCases
      .map((entry, index) => normalizeCaseEntry(entry, guildId, index + 1))
      .filter(Boolean)
      .sort(sortCasesNewestFirst);
  }

  if (typeof guildCases === 'object') {
    return Object.entries(guildCases)
      .map(([key, entry]) => normalizeCaseEntry(entry, guildId, key))
      .filter(Boolean)
      .sort(sortCasesNewestFirst);
  }

  return [];
}

function getGuildCaseMap(guildId) {
  const guildCases = getGuildCasesRaw(guildId);

  if (!guildCases || typeof guildCases !== 'object' || Array.isArray(guildCases)) {
    return {};
  }

  return guildCases;
}

function getGuildCaseList(guildId) {
  const guildCases = getGuildCasesRaw(guildId);
  return getGuildCaseEntries(guildCases, guildId);
}

function isWarningCase(entry) {
  const action = normalizeAction(entry.action);

  return (
    action === 'warn' ||
    action === 'warning' ||
    action.includes('warn')
  );
}

function getGuildWarnings(guildId) {
  return getGuildCaseList(guildId).filter(isWarningCase);
}

function buildSummary(guildId) {
  const cases = getGuildCaseList(guildId);
  const warnings = cases.filter(isWarningCase);

  const activeWarnings = warnings.filter((entry) => {
    const status = String(entry.status || '').toLowerCase();
    const cleared = Boolean(entry.cleared || entry.removed || entry.resolved);

    return !cleared && status !== 'cleared' && status !== 'removed' && status !== 'resolved';
  });

  const clearedWarnings = warnings.length - activeWarnings.length;

  return {
    guildId,
    casesPath: CASES_PATH,
    totalCases: cases.length,
    totalWarnings: warnings.length,
    activeWarnings: activeWarnings.length,
    clearedWarnings,
  };
}

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    return res.json(getGuildCaseMap(guildId));
  } catch (error) {
    console.error('Failed to load cases:', error);

    return res.status(500).json({
      error: 'Failed to load cases',
      detail: error.message || 'Unknown error',
    });
  }
});

router.get('/:guildId/list', (req, res) => {
  try {
    const { guildId } = req.params;
    const list = getGuildCaseList(guildId);

    return res.json(list);
  } catch (error) {
    console.error('Failed to load case list:', error);

    return res.status(500).json({
      error: 'Failed to load case list',
      detail: error.message || 'Unknown error',
    });
  }
});

router.get('/:guildId/warnings', (req, res) => {
  try {
    const { guildId } = req.params;
    const warnings = getGuildWarnings(guildId);

    return res.json(warnings);
  } catch (error) {
    console.error('Failed to load warnings:', error);

    return res.status(500).json({
      error: 'Failed to load warnings',
      detail: error.message || 'Unknown error',
    });
  }
});

router.get('/:guildId/summary', (req, res) => {
  try {
    const { guildId } = req.params;

    return res.json(buildSummary(guildId));
  } catch (error) {
    console.error('Failed to load moderation summary:', error);

    return res.status(500).json({
      error: 'Failed to load moderation summary',
      detail: error.message || 'Unknown error',
    });
  }
});

module.exports = router;