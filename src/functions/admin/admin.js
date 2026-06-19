const guildStore = require('../../guild/guildManager')

function getAdminPanelState(guildId) {
  const logs = guildStore.getGuildSection(
    guildId,
    'logs',
    guildStore.DEFAULT_LOGS
  );

  return {
    logs,
    adminActionsEnabled: logs.events?.adminActions !== false,
    automodActionsEnabled: logs.events?.automodActions !== false,
    moderationActionsEnabled: logs.events?.moderationActions !== false,
  };
}

function setAdminLogEvent(guildId, eventName, enabled) {
  const logs = guildStore.getGuildSection(
    guildId,
    'logs',
    guildStore.DEFAULT_LOGS
  );

  const nextLogs = {
    ...logs,
    events: {
      ...logs.events,
      [eventName]: enabled === true,
    },
  };

  return guildStore.saveGuildSection(guildId, 'logs', nextLogs);
}

module.exports = {
  getAdminPanelState,
  setAdminLogEvent,
};