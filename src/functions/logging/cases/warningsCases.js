const fs = require('fs');
const path = require('path');

const warningsPath = path.join(__dirname, '../../../data/warnings.json');
const caseDetailsPath = path.join(__dirname, '../../../data/modCaseDetails.json');

function ensureFile(filePath, fallback) {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
  }
}

function readJson(filePath, fallback) {
  ensureFile(filePath, fallback);

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`❌ Failed to read ${filePath}:`, error);
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureFile(filePath, Array.isArray(data) ? [] : {});
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getNextCaseNumber(guildCases) {
  const numbers = Object.keys(guildCases)
    .map(Number)
    .filter(Number.isFinite);

  if (!numbers.length) return 1;
  return Math.max(...numbers) + 1;
}

function warningsCases() {
  const warningsData = readJson(warningsPath, {});
  const caseData = readJson(caseDetailsPath, {});

  let migratedCount = 0;

  for (const [guildId, guildWarnings] of Object.entries(warningsData)) {
    if (!caseData[guildId]) {
      caseData[guildId] = {};
    }

    const guildCases = caseData[guildId];

    for (const [userId, warnings] of Object.entries(guildWarnings)) {
      if (!Array.isArray(warnings)) continue;

      for (const warning of warnings) {
        const alreadyExists = Object.values(guildCases).some(
          (existingCase) =>
            existingCase.action === 'Warn' &&
            existingCase.targetId === userId &&
            existingCase.reason === (warning.reason || 'No reason provided') &&
            existingCase.createdAt === (warning.timestamp || null)
        );

        if (alreadyExists) continue;

        const caseNumber = getNextCaseNumber(guildCases);

        guildCases[caseNumber] = {
          caseNumber,
          action: 'Warn',
          targetId: userId,
          targetTag: warning.targetTag || `Unknown User (${userId})`,
          moderatorId: warning.moderator || null,
          moderatorTag: warning.moderatorTag || 'Unknown Moderator',
          reason: warning.reason || 'No reason provided',
          createdAt: warning.timestamp || Date.now(),
          cleared: false,
          duration: null,
          evidence: warning.evidence || null,
          notes: [],
          migratedFromWarningsJson: true,
        };

        migratedCount++;
      }
    }
  }

  writeJson(caseDetailsPath, caseData);

  console.log(`✅ Migrated ${migratedCount} warning(s) into modCaseDetails.json`);
}

module.exports = warningsCases;