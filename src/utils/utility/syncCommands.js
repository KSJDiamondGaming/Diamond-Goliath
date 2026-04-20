require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_IDS = process.env.GUILD_IDS;
const COMMAND_MODE = (process.env.COMMAND_MODE || 'guild').toLowerCase();

if (!TOKEN) {
  throw new Error('Missing TOKEN in .env');
}

if (!CLIENT_ID) {
  throw new Error('Missing CLIENT_ID in .env');
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

/* ---------------- HELPERS ---------------- */

function parseGuildIds(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function getAllJsFiles(dir) {
  let results = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results = results.concat(getAllJsFiles(fullPath));
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith('.js') &&
      !entry.name.endsWith('.test.js') &&
      !entry.name.endsWith('.spec.js')
    ) {
      results.push(fullPath);
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

function loadCommands(commandsPath, mode = 'guild') {
  const commandFiles = getAllJsFiles(commandsPath);
  const commands = [];
  const seenNames = new Set();

  for (const filePath of commandFiles) {
    try {
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath);

      if (!command?.data || typeof command.execute !== 'function') {
        console.warn(`⚠️ Skipping invalid command module: ${filePath}`);
        continue;
      }

      const commandName = command.data?.name;

      if (!commandName || typeof commandName !== 'string') {
        console.warn(`⚠️ Skipping command with invalid name: ${filePath}`);
        continue;
      }

      if (mode === 'global' && command.devOnly) {
        console.log(`🧪 Skipping dev-only command in global mode: ${commandName}`);
        continue;
      }

      if (seenNames.has(commandName)) {
        console.warn(`⚠️ Duplicate command skipped: ${commandName} (${filePath})`);
        continue;
      }

      seenNames.add(commandName);
      commands.push(command.data.toJSON());
    } catch (error) {
      console.error(`❌ Failed to load command file: ${filePath}`);
      console.error(error);
    }
  }

  return commands;
}

/* ---------------- CLEAR ---------------- */

async function clearGuildCommands(guildIds) {
  if (!guildIds.length) {
    throw new Error('No GUILD_IDS provided for guild mode.');
  }

  console.log('🧹 Clearing guild commands...');

  for (const guildId of guildIds) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), {
      body: [],
    });

    console.log(`✅ Cleared guild commands: ${guildId}`);
  }
}

async function clearGlobalCommands() {
  console.log('🧹 Clearing global commands...');

  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: [],
  });

  console.log('✅ Cleared global commands');
}

/* ---------------- REGISTER ---------------- */

async function registerGuildCommands(guildIds, commands) {
  if (!guildIds.length) {
    throw new Error('No GUILD_IDS provided for guild mode.');
  }

  console.log('📡 Registering guild commands...');

  for (const guildId of guildIds) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), {
      body: commands,
    });

    console.log(`✅ Registered ${commands.length} commands for guild: ${guildId}`);
  }
}

async function registerGlobalCommands(commands) {
  console.log('🌍 Registering global commands...');

  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: commands,
  });

  console.log(`✅ Registered ${commands.length} global commands`);
}

/* ---------------- MAIN ---------------- */

async function syncCommands(options = {}) {
  const startTime = Date.now();

  const mode = (options.mode || COMMAND_MODE || 'guild').toLowerCase();
  const guildIds = parseGuildIds(options.guildIds ?? GUILD_IDS);
  const commandsPath =
    options.commandsPath || path.join(__dirname, '..', '..', 'commands');

  const commands = loadCommands(commandsPath, mode);

  console.log('🚀 Starting command sync...');
  console.log(`🛠️ Mode: ${mode}`);
  console.log(`📦 Commands loaded: ${commands.length}`);

  if (mode === 'guild') {
    console.log(
      `🏠 Guild targets: ${guildIds.length ? guildIds.join(', ') : 'none'}`
    );

    await clearGuildCommands(guildIds);
    await registerGuildCommands(guildIds, commands);
  } else if (mode === 'global') {
    await clearGlobalCommands();
    await registerGlobalCommands(commands);
  } else {
    throw new Error(`Invalid COMMAND_MODE "${mode}". Use "guild" or "global".`);
  }

  const durationMs = Date.now() - startTime;

  console.log(`🎉 Command sync complete in ${durationMs}ms`);

  return {
    mode,
    commands: commands.length,
    guilds: mode === 'guild' ? guildIds.length : 0,
    durationMs,
  };
}

if (require.main === module) {
  syncCommands().catch((error) => {
    console.error('❌ Command sync failed:');
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  syncCommands,
};