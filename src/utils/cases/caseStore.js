const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../../data/moderationCases.json');

function ensureFile() {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([], null, 2));
  }
}

function loadCases() {
  ensureFile();
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveCases(cases) {
  fs.writeFileSync(filePath, JSON.stringify(cases, null, 2));
}

function getNextCaseId() {
  const cases = loadCases();
  if (!cases.length) return 1;
  return Math.max(...cases.map(c => c.caseId || 0)) + 1;
}

function addCase(entry) {
  const cases = loadCases();
  cases.push(entry);
  saveCases(cases);
  return entry;
}

function getCasesByUser(guildId, userId) {
  const cases = loadCases();
  return cases.filter(
    entry => entry.guildId === guildId && entry.userId === userId
  );
}

module.exports = {
  addCase,
  getNextCaseId,
  getCasesByUser
};