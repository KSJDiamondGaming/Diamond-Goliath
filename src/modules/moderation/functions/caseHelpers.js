// functions/moderation/caseHelpers.js

const {
  updateCaseStatus,
  getAllCases,
} = require('../../../logging/cases/caseStore');

const {
  purgeExpiredWarnings,
} = require('../../../logging/warnings/warningStore');

const STATUS_LABELS = {
  active: '🟢 Active',
  reversed: '🔁 Reversed',
  expired: '⌛ Expired',
};

const TRACKED_ACTIONS = [
  'warn',
  'timeout',
  'kick',
  'ban',
  'unwarn',
  'remove-timeout',
];

function getStatus(modCase = {}) {
  return modCase.status || 'active';
}

function getStatusLabel(modCase = {}) {
  return STATUS_LABELS[getStatus(modCase)] || STATUS_LABELS.active;
}

function getCaseTimestamp(dateValue) {
  const timestamp = new Date(dateValue).getTime();

  if (!Number.isFinite(timestamp)) {
    return Math.floor(Date.now() / 1000);
  }

  return Math.floor(timestamp / 1000);
}

function formatCaseSummary(modCase = {}) {
  return [
    `#${modCase.caseId || '?'}`,
    modCase.action || 'unknown',
    getStatusLabel(modCase),
    `<t:${getCaseTimestamp(modCase.createdAt)}:R>`,
  ].join(' • ');
}

async function syncExpiredWarningsToCases(guildId) {
  const expiredWarnings = purgeExpiredWarnings(guildId) || [];

  for (const warning of expiredWarnings) {
    if (warning?.caseId) {
      updateCaseStatus(guildId, warning.caseId, 'expired');
    }
  }

  return expiredWarnings.length;
}

function countCasesByAction(cases = [], action) {
  return cases.filter((modCase) => modCase.action === action).length;
}

function countCasesByStatus(cases = [], status) {
  return cases.filter((modCase) => getStatus(modCase) === status).length;
}

function buildTopList(
  itemsMap = {},
  limit = 5,
  formatter = (id, count) => `${id} — ${count}`
) {
  return Object.entries(itemsMap)
    .filter(([id]) => Boolean(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, count]) => formatter(id, count));
}

function incrementCount(map, key) {
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
}

function getRecentCases(cases = [], limit = 5) {
  return cases
    .slice()
    .sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, limit);
}

function getActionCounts(cases = []) {
  return TRACKED_ACTIONS.reduce((counts, action) => {
    counts[`${action.replace(/-/g, '')}Count`] = countCasesByAction(cases, action);
    return counts;
  }, {});
}

function getModerationAnalytics(guildId) {
  const allCases = getAllCases(guildId) || [];

  const moderatorCounts = {};
  const userCounts = {};

  for (const modCase of allCases) {
    incrementCount(moderatorCounts, modCase.moderatorId);
    incrementCount(userCounts, modCase.userId);
  }

  return {
    totalCases: allCases.length,

    activeCases: countCasesByStatus(allCases, 'active'),
    reversedCases: countCasesByStatus(allCases, 'reversed'),
    expiredCases: countCasesByStatus(allCases, 'expired'),

    ...getActionCounts(allCases),

    topModerators: buildTopList(
      moderatorCounts,
      5,
      (id, count) => `<@${id}> • ${count} case${count === 1 ? '' : 's'}`
    ),

    topUsers: buildTopList(
      userCounts,
      5,
      (id, count) => `<@${id}> • ${count} case${count === 1 ? '' : 's'}`
    ),

    recentCases: getRecentCases(allCases, 5),
  };
}

module.exports = {
  STATUS_LABELS,
  TRACKED_ACTIONS,

  getStatus,
  getStatusLabel,
  getCaseTimestamp,
  formatCaseSummary,

  syncExpiredWarningsToCases,

  countCasesByAction,
  countCasesByStatus,
  buildTopList,
  incrementCount,
  getRecentCases,
  getActionCounts,

  getModerationAnalytics,
};
