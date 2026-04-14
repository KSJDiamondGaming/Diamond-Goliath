// 📜 Case Helper Utilities

const {
  updateCaseStatus,
  getAllCases
} = require('../logging/cases/caseStore');

const {
  purgeExpiredWarnings
} = require('../logging/modlogs/warningStore');

// 🟢 Status label with emoji
function getStatusLabel(modCase) {
  const status = modCase.status || 'active';

  if (status === 'reversed') return '🔁 Reversed';
  if (status === 'expired') return '⌛ Expired';

  return '🟢 Active';
}

// 🧾 Short case summary (used in dashboard)
function formatCaseSummary(modCase) {
  return `#${modCase.caseId} • ${modCase.action} • ${getStatusLabel(modCase)} • <t:${Math.floor(
    new Date(modCase.createdAt).getTime() / 1000
  )}:R>`;
}

// ⏰ Sync expired warnings → update cases
async function syncExpiredWarningsToCases(guildId) {
  const expiredWarnings = purgeExpiredWarnings(guildId);

  for (const warning of expiredWarnings) {
    updateCaseStatus(guildId, warning.caseId, 'expired');
  }
}

// 📊 Count helper
function countCasesByAction(cases, action) {
  return cases.filter(c => c.action === action).length;
}

// 📊 Count by status
function countCasesByStatus(cases, status) {
  return cases.filter(c => (c.status || 'active') === status).length;
}

// 🏆 Build top list (mods/users)
function buildTopList(itemsMap, limit = 5, formatter = (id, count) => `${id} — ${count}`) {
  return Object.entries(itemsMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, count]) => formatter(id, count));
}

// 📊 Full analytics generator
function getModerationAnalytics(guildId) {
  const allCases = getAllCases(guildId) || [];

  const moderatorCounts = {};
  const userCounts = {};

  for (const modCase of allCases) {
    moderatorCounts[modCase.moderatorId] =
      (moderatorCounts[modCase.moderatorId] || 0) + 1;

    userCounts[modCase.userId] =
      (userCounts[modCase.userId] || 0) + 1;
  }

  return {
    totalCases: allCases.length,

    activeCases: countCasesByStatus(allCases, 'active'),
    reversedCases: countCasesByStatus(allCases, 'reversed'),
    expiredCases: countCasesByStatus(allCases, 'expired'),

    warnCount: countCasesByAction(allCases, 'warn'),
    timeoutCount: countCasesByAction(allCases, 'timeout'),
    kickCount: countCasesByAction(allCases, 'kick'),
    banCount: countCasesByAction(allCases, 'ban'),
    unwarnCount: countCasesByAction(allCases, 'unwarn'),
    removeTimeoutCount: countCasesByAction(allCases, 'remove-timeout'),

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

    recentCases: allCases
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
  };
}

module.exports = {
  getStatusLabel,
  formatCaseSummary,
  syncExpiredWarningsToCases,
  countCasesByAction,
  countCasesByStatus,
  buildTopList,
  getModerationAnalytics
};