require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const COMMAND_MODE = String(process.env.COMMAND_MODE || 'guild').toLowerCase();
const GUILD_IDS = process.env.GUILD_IDS;

if (!TOKEN) throw new Error('❌ Missing TOKEN in .env');
if (!CLIENT_ID) throw new Error('❌ Missing CLIENT_ID in .env');

const rest = new REST({ version: '10' }).setToken(TOKEN);

function parseGuildIds(value) {
  return String(value || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^\d{16,20}$/.test(id));
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

function loadCommands(commandsPath, mode) {
  const commandFiles = getAllJsFiles(commandsPath);
  const commands = [];
  const seen = new Set();

  for (const filePath of commandFiles) {
    try {
      delete require.cache[require.resolve(filePath)];

      const command = require(filePath);
      const name = command?.data?.name;

      if (!command?.data || typeof command.execute !== 'function') {
        console.warn(`⚠️ Skipped invalid command: ${filePath}`);
        continue;
      }

      if (!name || typeof name !== 'string') {
        console.warn(`⚠️ Skipped unnamed command: ${filePath}`);
        continue;
      }

      if (seen.has(name)) {
        console.warn(`⚠️ Skipped duplicate command: ${name}`);
        continue;
      }

      if (mode === 'global' && command.devOnly === true) {
        console.log(`🧪 Skipped dev-only command in global mode: ${name}`);
        continue;
      }

      seen.add(name);
      commands.push(command.data.toJSON());

      console.log(`✅ Loaded command: ${name}`);
    } catch (error) {
      console.error(`❌ Failed to load command: ${filePath}`);
      console.error(error);
    }
  }

  return commands;
}

async function clearGuildCommands(guildIds) {
  for (const guildId of guildIds) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), {
      body: [],
    });

    console.log(`🧹 Cleared guild commands: ${guildId}`);
  }
}

async function registerGuildCommands(guildIds, commands) {
  for (const guildId of guildIds) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), {
      body: commands,
    });

    console.log(`✅ Registered ${commands.length} command(s) for guild: ${guildId}`);
  }
}

async function clearGlobalCommands() {
  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: [],
  });

  console.log('🧹 Cleared global commands');
}

async function registerGlobalCommands(commands) {
  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: commands,
  });

  console.log(`✅ Registered ${commands.length} global command(s)`);
}

async function syncCommands(options = {}) {
  const startedAt = Date.now();

  const mode = String(options.mode || COMMAND_MODE || 'guild').toLowerCase();
  const guildIds = parseGuildIds(options.guildIds ?? GUILD_IDS);

  const commandsPath =
    options.commandsPath || path.join(__dirname, '..', '..', 'commands');

  if (!['guild', 'global'].includes(mode)) {
    throw new Error(`❌ Invalid COMMAND_MODE "${mode}". Use "guild" or "global".`);
  }

  if (mode === 'guild' && guildIds.length === 0) {
    throw new Error('❌ GUILD_IDS is required when COMMAND_MODE is "guild".');
  }

  console.log('🚀 Starting command sync...');
  console.log(`🛠️ Mode: ${mode}`);
  console.log(`📂 Commands path: ${commandsPath}`);

  const commands = loadCommands(commandsPath, mode);

  console.log(`📦 Commands loaded: ${commands.length}`);

  if (mode === 'guild') {
    console.log(`🏠 Target guilds: ${guildIds.join(', ')}`);

    await clearGuildCommands(guildIds);
    await registerGuildCommands(guildIds, commands);
  }

  if (mode === 'global') {
    await clearGlobalCommands();
    await registerGlobalCommands(commands);
  }

  const durationMs = Date.now() - startedAt;

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
  parseGuildIds,
  getAllJsFiles,
  loadCommands,
};