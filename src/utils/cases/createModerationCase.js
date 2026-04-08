const { addCase, getNextCaseId } = require('./caseStore');

function createModerationCase({
  guildId,
  user,
  moderator,
  action,
  reason = 'No reason provided',
  duration = null
}) {
  const caseEntry = {
    caseId: getNextCaseId(),
    guildId,
    userId: user.id,
    userTag: user.tag,
    moderatorId: moderator ? moderator.id : null,
    moderatorTag: moderator ? moderator.tag : 'System',
    action,
    reason,
    duration,
    createdAt: new Date().toISOString()
  };

  addCase(caseEntry);
  return caseEntry;
}

module.exports = createModerationCase;