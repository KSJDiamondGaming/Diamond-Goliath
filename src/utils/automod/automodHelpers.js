function normalizeContent(content = '') {
  return String(content)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, maxLength = 1024) {
  const value = String(text ?? '');
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));

  if (!totalSeconds) return '0s';

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];

  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds && parts.length < 2) parts.push(`${seconds}s`);

  return parts.join(' ');
}

function getMemberHighestRolePosition(member) {
  return member?.roles?.highest?.position ?? 0;
}

function canActOnMember(actorMember, targetMember, guildOwnerId) {
  if (!actorMember || !targetMember) return false;

  if (targetMember.id === actorMember.id) return false;
  if (targetMember.id === guildOwnerId) return false;

  return getMemberHighestRolePosition(actorMember) > getMemberHighestRolePosition(targetMember);
}

module.exports = {
  normalizeContent,
  truncate,
  formatDuration,
  getMemberHighestRolePosition,
  canActOnMember,
};