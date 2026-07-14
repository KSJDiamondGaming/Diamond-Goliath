const guilds = new Map();

const defaults = {
  enabled: false,
  channelId: null,
  inviteCode: null,
  autoRepair: true,
  trackingEnabled: true,
};

function get(guildId) {
  return { ...defaults, ...(guilds.get(guildId) || {}) };
}

function set(guildId, patch) {
  const next = { ...get(guildId), ...patch };
  guilds.set(guildId, next);
  return next;
}

function remove(guildId) {
  guilds.delete(guildId);
}

function entries() {
  return [...guilds.entries()];
}

module.exports = { get, set, remove, entries };
