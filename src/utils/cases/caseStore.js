const fs = require('fs');
const path = require('path');

const CASES_PATH = path.join(__dirname, '..', '..', 'data', 'cases.json');

function ensureCasesFile() {
  const dir = path.dirname(CASES_PATH);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(CASES_PATH)) {
    fs.writeFileSync(CASES_PATH, '{}', 'utf8');
  }
}

function readCases() {
  ensureCasesFile();

  try {
    const raw = fs.readFileSync(CASES_PATH, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error('Failed to read cases:', error);
    return {};
  }
}

function writeCases(data) {
  ensureCasesFile();

  try {
    fs.writeFileSync(CASES_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Failed to write cases:', error);
    return false;
  }
}

function getGuildCases(guildId) {
  const data = readCases();
  return Array.isArray(data[guildId]) ? data[guildId] : [];
}

function getNextCaseNumber(guildId) {
  const cases = getGuildCases(guildId);
  if (!cases.length) return 1;

  return Math.max(...cases.map((entry) => Number(entry.caseNumber) || 0)) + 1;
}

function addCase(guildId, caseData) {
  const data = readCases();

  if (!Array.isArray(data[guildId])) {
    data[guildId] = [];
  }

  const entry = {
    caseNumber: getNextCaseNumber(guildId),
    createdAt: new Date().toISOString(),
    ...caseData,
  };

  data[guildId].push(entry);
  writeCases(data);

  return entry;
}

function getCaseByNumber(guildId, caseNumber) {
  const cases = getGuildCases(guildId);
  return cases.find((entry) => Number(entry.caseNumber) === Number(caseNumber)) || null;
}

module.exports = {
  getGuildCases,
  getCaseByNumber,
  addCase,
};