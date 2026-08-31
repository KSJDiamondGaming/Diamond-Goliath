'use strict';

const fs = require('node:fs');
const {
  CANONICAL_COMMAND_NAMES,
  getCanonicalCommandFiles,
} = require('./commandLoader');
const { REST, Routes } = require('discord.js');
const { loadEnvironment } = require('../../config/envLoader');
const { resolveTokenDetails, getRequiredTokenEnvName } = require('../../config/tokenResolver');
const { BETA_GUILD_IDS: CONFIGURED_BETA_GUILD_IDS = [] } = require('../../config/betaGuilds');
const auditStore = require('../../owner/auditIntelligence/auditStore');

const ALLOWED_MODES = new Set(['dev', 'beta', 'production']);
const PRIVATE_COMMAND_NAMES = new Set(['owner', 'commandcenter']);
const PUBLIC_COMMAND_NAMES = new Set([...CANONICAL_COMMAND_NAMES].filter((name) => !PRIVATE_COMMAND_NAMES.has(name)));

function resolveMode() {
  const fromArg = String(process.argv[2] || '').trim().toLowerCase();
  const fromEnv = String(process.env.BOT_MODE || '').trim().toLowerCase();
  if (ALLOWED_MODES.has(fromArg)) return fromArg;
  if (ALLOWED_MODES.has(fromEnv)) return fromEnv;
  return 'dev';
}

function firstEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function uniqueGuildIds(values) {
  return [...new Set(values
    .flatMap((value) => Array.isArray(value) ? value : String(value || '').split(','))
    .map((value) => String(value || '').trim())
    .filter((value) => /^\d{16,25}$/.test(value)))];
}

function configuredGuildIds(mode) {
  if (mode === 'beta') {
    return uniqueGuildIds([
      process.env.BETA_GUILD_IDS,
      process.env.BETA_GUILD_ID,
      process.env.MAIN_GUILD_ID,
      process.env.GUILD_ID,
      CONFIGURED_BETA_GUILD_IDS,
    ]);
  }
  if (mode === 'production') {
    return uniqueGuildIds([
      process.env.PRODUCTION_GUILD_IDS,
      process.env.PRODUCTION_GUILD_ID,
      process.env.MAIN_GUILD_ID,
      process.env.GUILD_ID,
    ]);
  }
  return uniqueGuildIds([
    process.env.DEV_GUILD_IDS,
    process.env.DEV_GUILD_ID,
    process.env.MAIN_GUILD_ID,
    process.env.GUILD_ID,
  ]);
}

function loadCanonicalCommands() {
  const files = getCanonicalCommandFiles();
  const commands = [];
  const seen = new Set();

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) throw new Error(`Missing canonical command: ${filePath}`);
    delete require.cache[require.resolve(filePath)];
    const command = require(filePath);
    const name = String(command?.data?.name || '').trim();
    if (!CANONICAL_COMMAND_NAMES.has(name)) {
      throw new Error(`Unexpected canonical command name in ${filePath}: ${name || 'missing'}`);
    }
    if (seen.has(name)) throw new Error(`Duplicate canonical command: /${name}`);
    if (typeof command.execute !== 'function' || typeof command.data?.toJSON !== 'function') {
      throw new Error(`Invalid canonical command module: ${filePath}`);
    }
    seen.add(name);
    commands.push(command.data.toJSON());
  }

  if (seen.size !== CANONICAL_COMMAND_NAMES.size) {
    throw new Error(`Expected /admin, /mod, /user, /owner, /e and Convert Emoji Shortcodes; loaded ${[...seen].join(', ')}`);
  }

  return commands;
}

function commandCenterGuildId() {
  return String(
    auditStore.getConfig()?.commandCenter?.guildId
      || process.env.COMMAND_CENTER_GUILD_ID
      || ''
  ).trim();
}

function timeoutMs() {
  const value = Number(process.env.DISCORD_REST_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 1000 ? value : 30000;
}

function assertOwnerCommandPrivate(ownerCommand) {
  if (!ownerCommand) return;
  const permissions = ownerCommand.default_member_permissions;
  if (String(permissions) !== '0') {
    throw new Error('Refusing to sync /owner without default_member_permissions=0. Owner command must remain hidden by default.');
  }
}

async function putGuildCommands(rest, clientId, guildId, publicCommands, ownerCommand, includeOwner, dryRun) {
  const body = [
    ...publicCommands,
    ...(includeOwner && ownerCommand ? [ownerCommand] : []),
  ];

  if (dryRun) {
    console.log(`[CommandSync] DRY RUN guild ${guildId}: ${body.map((command) => `/${command.name}`).join(', ')}`);
    return;
  }

  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
  console.log(`[CommandSync] Guild ${guildId}: ${body.map((command) => `/${command.name}`).join(', ')}`);
}

async function putGlobalCommands(rest, clientId, commands, dryRun) {
  if (dryRun) {
    console.log(`[CommandSync] DRY RUN global: ${commands.map((command) => `/${command.name}`).join(', ')}`);
    return;
  }
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log(`[CommandSync] Global: ${commands.map((command) => `/${command.name}`).join(', ')}`);
}

async function upsertPrivateOwnerCommand(rest, clientId, privateGuildId, ownerCommand, dryRun = false) {
  if (!privateGuildId || !ownerCommand) return false;
  assertOwnerCommandPrivate(ownerCommand);

  const existing = await rest.get(Routes.applicationGuildCommands(clientId, privateGuildId));
  const current = (existing || []).find((command) => command?.name === 'owner');

  if (dryRun) {
    console.log(`[CommandSync] DRY RUN ${current ? 'update' : 'create'} private /owner in ${privateGuildId}`);
    return true;
  }

  if (current) {
    await rest.patch(Routes.applicationGuildCommand(clientId, privateGuildId, current.id), { body: ownerCommand });
  } else {
    await rest.post(Routes.applicationGuildCommands(clientId, privateGuildId), { body: ownerCommand });
  }
  console.log(`[CommandSync] Private /owner ${current ? 'updated' : 'created'} in ${privateGuildId}.`);
  return true;
}

async function cleanupStaleGlobalCommands(rest, clientId, dryRun = false) {
  const commands = await rest.get(Routes.applicationCommands(clientId));
  const stale = (commands || []).filter((command) => !PUBLIC_COMMAND_NAMES.has(String(command?.name || '')));

  for (const command of stale) {
    if (dryRun) {
      console.log(`[CommandSync] DRY RUN remove stale global /${command.name}`);
      continue;
    }
    await rest.delete(Routes.applicationCommand(clientId, command.id));
    console.log(`[CommandSync] Removed stale global /${command.name}`);
  }

  return stale.map((command) => command.name);
}

async function cleanupPrivateCommandScope(rest, clientId, guildIds, allowedOwnerGuildIds = [], dryRun = false) {
  const allowedOwnerGuilds = new Set(uniqueGuildIds([allowedOwnerGuildIds]));
  const scopes = uniqueGuildIds([guildIds, [...allowedOwnerGuilds]]);
  for (const guildId of scopes) {
    if (!guildId) continue;
    const commands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
    const stale = (commands || []).filter((command) => {
      const name = String(command?.name || '');
      if (name === 'commandcenter') return true;
      return name === 'owner' && !allowedOwnerGuilds.has(guildId);
    });
    for (const command of stale) {
      if (dryRun) {
        console.log(`[CommandSync] DRY RUN remove retired private /${command.name} from ${guildId}`);
        continue;
      }
      await rest.delete(Routes.applicationGuildCommand(clientId, guildId, command.id));
      console.log(`[CommandSync] Removed retired private /${command.name} from ${guildId}`);
    }
  }
}

async function syncCommands() {
  const mode = resolveMode();
  process.env.BOT_MODE = mode;
  const loadedEnv = loadEnvironment(mode);
  const modeUpper = mode.toUpperCase();
  const tokenDetails = resolveTokenDetails({ mode: modeUpper });
  const token = String(tokenDetails.token || '').trim();
  const clientId = firstEnv(['DISCORD_CLIENT_ID', 'CLIENT_ID', 'APPLICATION_ID']);
  const requiredTokenName = getRequiredTokenEnvName(modeUpper);

  if (!token) throw new Error(`Missing ${requiredTokenName} in ${loadedEnv?.envFile || `.env.${mode}`}`);
  if (!clientId) throw new Error(`Missing DISCORD_CLIENT_ID in ${loadedEnv?.envFile || `.env.${mode}`}`);

  const commandMode = String(process.env.COMMAND_MODE || (mode === 'production' ? 'global' : 'guild')).trim().toLowerCase();
  if (!['guild', 'global'].includes(commandMode)) throw new Error(`Invalid COMMAND_MODE: ${commandMode}`);

  const dryRun = ['1', 'true', 'yes', 'on'].includes(String(process.env.COMMAND_SYNC_DRY_RUN || '').toLowerCase());
  const commands = loadCanonicalCommands();
  const publicCommands = commands.filter((command) => PUBLIC_COMMAND_NAMES.has(command.name));
  const ownerCommand = mode === 'dev' ? commands.find((command) => command.name === 'owner') || null : null;
  if (ownerCommand) assertOwnerCommandPrivate(ownerCommand);

  const guildIds = configuredGuildIds(mode);
  const privateGuildId = commandCenterGuildId();
  const rest = new REST({ version: '10', timeout: timeoutMs() }).setToken(token);
  let removedGlobalCommands = [];

  if (commandMode === 'global') {
    await putGlobalCommands(rest, clientId, publicCommands, dryRun);
    const allowedOwnerGuildIds = ownerCommand && privateGuildId ? [privateGuildId] : [];
    if (ownerCommand) await upsertPrivateOwnerCommand(rest, clientId, privateGuildId, ownerCommand, dryRun);
    await cleanupPrivateCommandScope(rest, clientId, uniqueGuildIds([guildIds, privateGuildId]), allowedOwnerGuildIds, dryRun);
    removedGlobalCommands = await cleanupStaleGlobalCommands(rest, clientId, dryRun);
  } else {
    if (!guildIds.length) throw new Error(`No guild IDs configured for ${mode}`);
    const allowedOwnerGuildIds = ownerCommand ? uniqueGuildIds([guildIds, privateGuildId]) : [];
    for (const guildId of guildIds) {
      await putGuildCommands(rest, clientId, guildId, publicCommands, ownerCommand, Boolean(ownerCommand), dryRun);
    }
    if (ownerCommand && privateGuildId && !guildIds.includes(privateGuildId)) {
      await upsertPrivateOwnerCommand(rest, clientId, privateGuildId, ownerCommand, dryRun);
    }
    await cleanupPrivateCommandScope(rest, clientId, uniqueGuildIds([guildIds, privateGuildId]), allowedOwnerGuildIds, dryRun);
    removedGlobalCommands = await cleanupStaleGlobalCommands(rest, clientId, dryRun);
  }

  return {
    mode,
    commandMode,
    dryRun,
    guildIds,
    commands: publicCommands.map((command) => command.name),
    privateCommands: ownerCommand ? ['owner'] : [],
    ownerCommandDefaultDenied: ownerCommand ? String(ownerCommand.default_member_permissions) === '0' : null,
    removedGlobalCommands,
  };
}

if (require.main === module) {
  syncCommands()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  CANONICAL_COMMAND_NAMES,
  PUBLIC_COMMAND_NAMES,
  PRIVATE_COMMAND_NAMES,
  getCanonicalCommandFiles,
  loadCanonicalCommands,
  configuredGuildIds,
  cleanupStaleGlobalCommands,
  cleanupPrivateCommandScope,
  upsertPrivateOwnerCommand,
  assertOwnerCommandPrivate,
  syncCommands,
};
