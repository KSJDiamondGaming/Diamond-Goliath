'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');
const { loadEnvironment } = require('../../config/envLoader');

const ALLOWED_MODES = ['dev', 'beta', 'production'];
const ALLOWED_COMMAND_MODES = ['guild', 'global'];
const COMMAND_NAME_REGEX = /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
}

function firstEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

function resolveBotMode() {
  const argMode = process.argv[2]?.toLowerCase();
  const envMode = process.env.BOT_MODE?.toLowerCase();

  if (ALLOWED_MODES.includes(argMode)) return argMode;
  if (ALLOWED_MODES.includes(envMode)) return envMode;
  return 'dev';
}

const selectedMode = resolveBotMode();
process.env.BOT_MODE = selectedMode;

const loadedEnv = loadEnvironment(selectedMode);
const BOT_MODE = selectedMode.toUpperCase();
const envFile = loadedEnv?.envFile || `.env.${selectedMode}`;

function required(label, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing ${label} in ${envFile}`);
  }
  return String(value).trim();
}

function requiredAny(names, label = names[0]) {
  return required(label, firstEnv(names));
}

const TOKEN = requiredAny(['DISCORD_TOKEN', 'DISCORD_BOT_TOKEN', 'TOKEN'], 'DISCORD_TOKEN');
const CLIENT_ID = requiredAny(['DISCORD_CLIENT_ID', 'CLIENT_ID', 'APPLICATION_ID'], 'DISCORD_CLIENT_ID');

const COMMAND_MODE = (() => {
  const value = process.env.COMMAND_MODE?.toLowerCase();
  if (ALLOWED_COMMAND_MODES.includes(value)) return value;
  return BOT_MODE === 'PRODUCTION' ? 'global' : 'guild';
})();

const GUILD_IDS = BOT_MODE === 'DEV'
  ? firstEnv(['DEV_GUILD_ID', 'MAIN_GUILD_ID', 'GUILD_ID'])
  : BOT_MODE === 'BETA'
    ? firstEnv(['BETA_GUILD_IDS', 'BETA_GUILD_ID', 'MAIN_GUILD_ID', 'GUILD_ID'])
    : firstEnv(['PRODUCTION_GUILD_IDS', 'PRODUCTION_GUILD_ID', 'MAIN_GUILD_ID', 'GUILD_ID']);

const DRY_RUN = envFlag('COMMAND_SYNC_DRY_RUN', false);
const CLEAR_BEFORE_SYNC = envFlag('CLEAR_COMMANDS_BEFORE_SYNC', false);

const rest = new REST({
  version: '10',
  timeout: Number(process.env.DISCORD_REST_TIMEOUT_MS || 120000),
}).setToken(TOKEN);

function parseGuildIds(value) {
  return String(value || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^\d{16,25}$/.test(id));
}

function getAllJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const files = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...getAllJsFiles(fullPath));
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith('.js') &&
      !entry.name.endsWith('.test.js') &&
      !entry.name.endsWith('.spec.js')
    ) {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function validateCommandPayload(command, filePath) {
  const errors = [];

  if (!command || typeof command !== 'object') {
    return [`${filePath}: payload is not an object`];
  }

  if (!command.name || typeof command.name !== 'string') {
    errors.push(`${filePath}: missing command name`);
  } else {
    if (command.name !== command.name.toLowerCase()) {
      errors.push(`${filePath}: command name must be lowercase (${command.name})`);
    }

    if (!COMMAND_NAME_REGEX.test(command.name)) {
      errors.push(`${filePath}: invalid command name (${command.name})`);
    }
  }

  if (!command.description || typeof command.description !== 'string') {
    errors.push(`${filePath}: missing command description`);
  } else if (command.description.length > 100) {
    errors.push(`${filePath}: description too long (${command.description.length}/100)`);
  }

  if (Array.isArray(command.options)) {
    for (const option of command.options) {
      if (!option.name) {
        errors.push(`${filePath}: option missing name`);
        continue;
      }

      if (option.name !== option.name.toLowerCase()) {
        errors.push(`${filePath}: option name must be lowercase (${option.name})`);
      }

      if (!COMMAND_NAME_REGEX.test(option.name)) {
        errors.push(`${filePath}: invalid option name (${option.name})`);
      }

      if (!option.description || typeof option.description !== 'string') {
        errors.push(`${filePath}: option ${option.name} missing description`);
      } else if (option.description.length > 100) {
        errors.push(`${filePath}: option ${option.name} description too long`);
      }
    }
  }

  return errors;
}

function loadCommands(commandsPath, mode) {
  const commands = [];
  const seen = new Set();
  const errors = [];

  for (const filePath of getAllJsFiles(commandsPath)) {
    try {
      delete require.cache[require.resolve(filePath)];

      const commandModule = require(filePath);
      const commandName = commandModule?.data?.name;

      if (!commandModule?.data || typeof commandModule.execute !== 'function') {
        console.warn(`Skipped invalid command module: ${filePath}`);
        continue;
      }

      if (!commandName || typeof commandName !== 'string') {
        errors.push(`${filePath}: missing command data name`);
        continue;
      }

      if (seen.has(commandName)) {
        errors.push(`${filePath}: duplicate command name /${commandName}`);
        continue;
      }

      if (mode === 'global' && commandModule.devOnly === true) {
        console.log(`Skipped dev-only command: /${commandName}`);
        continue;
      }

      const payload = commandModule.data.toJSON();
      const validationErrors = validateCommandPayload(payload, filePath);

      if (validationErrors.length) {
        errors.push(...validationErrors);
        continue;
      }

      seen.add(commandName);
      commands.push(payload);

      console.log(`Loaded command: /${commandName}`);
    } catch (error) {
      errors.push(`${filePath}: failed to load - ${error.message}`);
    }
  }

  if (errors.length) {
    throw new Error(`Command validation failed:\n${errors.map((error) => ` - ${error}`).join('\n')}`);
  }

  return commands;
}

async function clearGuildCommands(guildId) {
  console.log(`Clearing guild commands: ${guildId}`);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: [] });
  console.log(`Cleared guild commands: ${guildId}`);
}

async function syncGuildCommands(guildIds, commands) {
  for (const guildId of guildIds) {
    if (CLEAR_BEFORE_SYNC) {
      await clearGuildCommands(guildId);
    }

    console.log(`Registering ${commands.length} guild command(s): ${guildId}`);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), {
      body: commands,
    });
    console.log(`Registered ${commands.length} guild command(s): ${guildId}`);
  }
}

async function clearGlobalCommands() {
  console.log('Clearing global commands');
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
  console.log('Cleared global commands');
}

async function syncGlobalCommands(commands) {
  if (CLEAR_BEFORE_SYNC) {
    await clearGlobalCommands();
  }

  console.log(`Registering ${commands.length} global command(s)`);
  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: commands,
  });
  console.log(`Registered ${commands.length} global command(s)`);
}

function printBanner(mode, commandsPath) {
  console.log('============================================================');
  console.log('Syncing Goliath Commands');
  console.log(`Bot Mode: ${BOT_MODE}`);
  console.log(`Env: ${envFile}`);
  console.log(`Command Mode: ${mode.toUpperCase()}`);
  console.log(`Client ID: ${CLIENT_ID}`);
  console.log(`Commands Path: ${commandsPath}`);
  console.log(`Dry Run: ${DRY_RUN ? 'YES' : 'NO'}`);
  console.log(`Clear Before Sync: ${CLEAR_BEFORE_SYNC ? 'YES' : 'NO'}`);
  console.log('============================================================');
}

async function syncCommands(options = {}) {
  const startedAt = Date.now();

  const mode = String(options.mode || COMMAND_MODE).toLowerCase();
  const commandsPath = options.commandsPath || path.join(process.cwd(), 'src', 'commands');
  const guildIds = parseGuildIds(options.guildIds ?? GUILD_IDS);

  if (!ALLOWED_COMMAND_MODES.includes(mode)) {
    throw new Error(`Invalid command mode "${mode}". Use "guild" or "global".`);
  }

  if (mode === 'guild' && guildIds.length === 0) {
    throw new Error(`No valid guild IDs found for ${BOT_MODE} mode.`);
  }

  printBanner(mode, commandsPath);

  const commands = loadCommands(commandsPath, mode);

  console.log(`Commands loaded and validated: ${commands.length}`);

  if (commands.length === 0) {
    throw new Error('No commands loaded. Sync aborted to protect existing Discord commands.');
  }

  if (DRY_RUN) {
    console.log('Dry run complete. No Discord API calls were made.');
    return {
      botMode: BOT_MODE,
      commandMode: mode,
      commands: commands.length,
      guilds: mode === 'guild' ? guildIds.length : 0,
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  if (mode === 'guild') {
    console.log(`Target guilds: ${guildIds.join(', ')}`);
    await syncGuildCommands(guildIds, commands);
  } else {
    await syncGlobalCommands(commands);
  }

  const durationMs = Date.now() - startedAt;

  console.log('============================================================');
  console.log(`Command sync complete in ${durationMs}ms`);
  console.log('============================================================');

  return {
    botMode: BOT_MODE,
    commandMode: mode,
    commands: commands.length,
    guilds: mode === 'guild' ? guildIds.length : 0,
    dryRun: false,
    durationMs,
  };
}

if (require.main === module) {
  syncCommands().catch((error) => {
    console.error('Command sync failed');
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  syncCommands,
  parseGuildIds,
  getAllJsFiles,
  loadCommands,
  validateCommandPayload,
};