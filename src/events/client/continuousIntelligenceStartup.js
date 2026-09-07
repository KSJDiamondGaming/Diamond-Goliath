'use strict';

const { Events } = require('discord.js');
const continuous = require('../../core/administration/mod/continuousIntelligence');

let timer = null;

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    const run = async () => {
      try {
        const result = await continuous.sweepClient(client);
        if (result.changed || result.failures) console.log(`[Continuous Intelligence] checked=${result.checked} changed=${result.changed} failures=${result.failures}`);
      } catch (error) {
        console.warn('[Continuous Intelligence] periodic sweep failed:', error?.message || error);
      } finally {
        clearTimeout(timer);
        timer = setTimeout(run, continuous.getSweepIntervalMs(client));
        timer.unref?.();
      }
    };
    timer = setTimeout(run, continuous.getSweepIntervalMs(client));
    timer.unref?.();
  },
};
