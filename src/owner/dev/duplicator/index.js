'use strict';

const { Client } = require('discord.js');
const core = require('./core');
const selective = require('./selective');
selective.configure(core);

const BOOTSTRAP_KEY = Symbol.for('goliath.duplicator.bridge-bootstrap');
if (!Client.prototype[BOOTSTRAP_KEY]) {
  const originalLogin = Client.prototype.login;
  Object.defineProperty(Client.prototype, BOOTSTRAP_KEY, { value: true });
  Client.prototype.login = function goliathDuplicatorLogin(...args) {
    core.initializeBridge(this);
    return originalLogin.apply(this, args);
  };
}

async function run(interaction) {
  const action = interaction?.options?.getString?.('action', true);
  if (action === 'copy') return selective.startCopy(interaction);
  return core.run(interaction);
}

async function handleInteraction(interaction) {
  if (await selective.handleInteraction(interaction)) return true;
  return core.handleInteraction(interaction);
}

module.exports = { ...core, run, handleInteraction, selective };
