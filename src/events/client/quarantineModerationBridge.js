'use strict';

const { Events } = require('discord.js');

// Investigation/quarantine routing is handled directly by the central
// moderation interaction router. Keep this event as a compatibility stub only
// so legacy event discovery cannot wrap the handler a second time.
module.exports = {
  name: Events.ClientReady,
  once: true,
  execute() {
    return true;
  },
};
