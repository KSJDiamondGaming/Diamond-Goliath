'use strict';

const giveawaysManager = require('./giveawaysManager');

function start(client) {
  const timer = giveawaysManager.startGiveawayScheduler(client);
  return {
    ok: Boolean(client),
    guildsChecked: client?.guilds?.cache?.size || 0,
    started: Boolean(timer),
  };
}

module.exports = { start };
