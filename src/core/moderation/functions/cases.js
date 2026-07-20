const guildStore = require('../../guild/guildManager');

function getGuildCases(guildId) {
  return guildStore.getGuildSection(guildId, 'cases', {});
}

function saveGuildCases(guildId, cases) {
  return guildStore.replaceGuildSection(guildId, 'cases', cases || {});
}

function getNextCaseNumber(guildId) {
  const cases = getGuildCases(guildId);

  const highest = Object.values(cases).reduce((max, entry) => {
    return Math.max(max, Number(entry?.caseNumber || 0));
  }, 0);

  return highest + 1;
}

function createCase(guildId, data = {}) {
  const cases = getGuildCases(guildId);
  const caseNumber = Number(data.caseNumber || getNextCaseNumber(guildId));
  const caseId = String(caseNumber);

  const entry = {
    caseNumber,
    guildId,
    createdAt: new Date().toISOString(),
    ...data,
  };

  cases[caseId] = entry;

  saveGuildCases(guildId, cases);

  return entry;
}

function getCase(guildId, caseNumber) {
  const cases = getGuildCases(guildId);
  return cases[String(caseNumber)] || null;
}

function updateCase(guildId, caseNumber, updates = {}) {
  const cases = getGuildCases(guildId);
  const id = String(caseNumber);

  if (!cases[id]) return null;

  cases[id] = {
    ...cases[id],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  saveGuildCases(guildId, cases);

  return cases[id];
}

function listCases(guildId) {
  return Object.values(getGuildCases(guildId)).sort(
    (a, b) => Number(b?.caseNumber || 0) - Number(a?.caseNumber || 0)
  );
}

function listWarnings(guildId, userId = null) {
  return listCases(guildId).filter((entry) => {
    const isWarn = String(entry?.action || '').toLowerCase() === 'warn';
    if (!isWarn) return false;
    if (!userId) return true;
    return String(entry?.targetId || entry?.userId || '') === String(userId);
  });
}

module.exports = {
  getGuildCases,
  saveGuildCases,
  getNextCaseNumber,
  createCase,
  getCase,
  updateCase,
  listCases,
  listWarnings,
};