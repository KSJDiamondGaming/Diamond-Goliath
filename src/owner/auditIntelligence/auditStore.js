'use strict';

const fs = require('node:fs');
const path = require('node:path');
const core = require('./auditStoreCore');

const DEFAULT_COMMAND_CENTER_GUILD_ID = String(process.env.COMMAND_CENTER_GUILD_ID || '1515201360386068642').trim();

function readRawControl() {
  try {
    return JSON.parse(fs.readFileSync(core.getControlConfigPath(), 'utf8'));
  } catch {
    return {};
  }
}

function selectedGuildId(config = {}) {
  const raw = readRawControl();
  return String(raw.commandCenter?.guildId || process.env.COMMAND_CENTER_GUILD_ID || config.commandCenter?.guildId || DEFAULT_COMMAND_CENTER_GUILD_ID).trim();
}

function overlay(config = {}) {
  return {
    ...config,
    commandCenter: {
      ...(config.commandCenter || {}),
      guildId: selectedGuildId(config),
    },
  };
}

function persistGuildId(guildId) {
  const id = String(guildId || '').trim();
  if (!id) return;
  const file = core.getControlConfigPath();
  const raw = readRawControl();
  raw.commandCenter = { ...(raw.commandCenter || {}), guildId: id };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
}

function getConfig() {
  return overlay(core.getConfig());
}

function saveConfig(config = {}) {
  const requestedGuildId = String(config.commandCenter?.guildId || selectedGuildId(config)).trim();
  const saved = core.saveConfig(config);
  persistGuildId(requestedGuildId);
  return overlay(saved);
}

function updateConfig(patch = {}) {
  const current = getConfig();
  const requestedGuildId = String(patch.commandCenter?.guildId || current.commandCenter?.guildId || DEFAULT_COMMAND_CENTER_GUILD_ID).trim();
  const saved = core.updateConfig(patch);
  persistGuildId(requestedGuildId);
  return overlay(saved);
}

module.exports = {
  ...core,
  getConfig,
  saveConfig,
  updateConfig,
};
