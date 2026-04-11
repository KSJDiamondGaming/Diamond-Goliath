const fs = require('fs');
const path = require('path');

const caseDetailsPath = path.join(__dirname, '../../data/modCaseDetails.json');

function ensureCaseFile() {
  const dir = path.dirname(caseDetailsPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(caseDetailsPath)) {
    fs.writeFileSync(caseDetailsPath, JSON.stringify({}, null, 2));
  }
}

function readCaseData() {
  ensureCaseFile();

  try {
    const raw = fs.readFileSync(caseDetailsPath, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error('❌ Failed to read moderation case data:', error);
    return {};
  }
}

function writeCaseData(data) {
  ensureCaseFile();
  fs.writeFileSync(caseDetailsPath, JSON.stringify(data, null, 2));
}

function getNextCaseNumber(guildCases) {
  const numbers = Object.keys(guildCases).map(Number).filter(Number.isFinite);

  if (!numbers.length) return 1;
  return Math.max(...numbers) + 1;
}

function createModCase({
  guildId,
  action,
  targetUser,
  moderator,
  reason = 'No reason provided',
  duration = null,
  evidence = null,
}) {
  if (!guildId || !action || !targetUser) {
    throw new Error('Missing required case fields.');
  }

  const data = readCaseData();

  if (!data[guildId]) {
    data[guildId] = {};
  }

  const guildCases = data[guildId];
  const caseNumber = getNextCaseNumber(guildCases);

  guildCases[caseNumber] = {
    caseNumber,
    action,
    targetId: targetUser.id,
    targetTag: targetUser.tag,
    moderatorId: moderator?.id || null,
    moderatorTag: moderator?.tag || 'System',
    reason,
    createdAt: Date.now(),
    cleared: false,
    duration,
    evidence,
    notes: [],
  };

  writeCaseData(data);

  return {
    caseNumber,
    caseData: guildCases[caseNumber],
  };
}

module.exports = createModCase;