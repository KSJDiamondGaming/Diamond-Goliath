'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { Client } = require('discord.js');

function loadCoreAtLegacyLocation() {
  const sourcePath = path.join(__dirname, 'core.js');
  const legacyFilename = path.join(__dirname, '..', 'duplicatorV2.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const legacyModule = new Module(legacyFilename, module);
  legacyModule.filename = legacyFilename;
  legacyModule.paths = Module._nodeModulePaths(path.dirname(legacyFilename));
  require.cache[legacyFilename] = legacyModule;
  legacyModule._compile(source, legacyFilename);
  return legacyModule.exports;
}

const core = loadCoreAtLegacyLocation();
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

module.exports = {
  ...core,
  run,
  handleInteraction,
  selective,
};
