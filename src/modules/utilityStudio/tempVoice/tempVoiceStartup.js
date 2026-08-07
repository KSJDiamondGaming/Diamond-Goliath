'use strict';

let started = false;

async function startup(client) {
  if (started) return false;
  if (!client?.guilds?.cache) throw new Error('Discord client is unavailable.');

  started = true;
  return true;
}

function shutdown() {
  const wasStarted = started;
  started = false;
  return wasStarted;
}

module.exports = {
  startup,
  shutdown,
};
