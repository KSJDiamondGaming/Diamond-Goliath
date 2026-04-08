function capsAbuseCheck(message, config) {
  const rule = config.rules.capsAbuse;
  if (!rule?.enabled) return null;

  const content = String(message.content || '').trim();
  if (!content) return null;

  const letters = content.match(/[a-z]/gi);
  if (!letters || letters.length < (rule.minLength || 12)) return null;

  const uppercaseLetters = content.match(/[A-Z]/g) || [];
  const ratio = uppercaseLetters.length / letters.length;

  if (ratio >= (rule.threshold || 0.7)) {
    return {
      matched: true,
      ruleName: 'Caps Abuse',
      punishment: rule.punishment,
      reason: `Message contained excessive capital letters (${Math.round(ratio * 100)}%).`,
    };
  }

  return null;
}

module.exports = capsAbuseCheck;