const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

/* ---------------- LOAD COMMAND FILES ---------------- */

function getCommandFiles(dir) {
  let results = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results = results.concat(getCommandFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

function loadCommands(commandsPath, mode = 'guild') {
  const commandFiles = getCommandFiles(commandsPath);
  const commands = [];

  for (const filePath of commandFiles) {
    try {
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath);

      if (!command?.data || typeof command.execute !== 'function') {
        continue;
      }

      if (mode === 'global' && command.devOnly) {
        console.log(`🧪 Skipping dev-only command: ${command.data.name}`);
        continue;
      }

      commands.push(command.data.toJSON());
    } catch (error) {
      console.error(`❌ Failed to load command: ${filePath}`);
      console.error(error);
    }
  }

  return commands;
}

/* ---------------- GUILD ID RESOLUTION ---------------- */

function resolveGuildIds(guildIds, client) {
  if (Array.isArray(guildIds) && guildIds.length) {
    return guildIds.map(String);
  }

  if (client?.guilds?.cache?.size) {
    return client.guilds.cache.map((g) => g.id);
  }

  return [];
}

/* ---------------- MAIN REGISTER FUNCTION ---------------- */

async function registerCommands({
  token,
  clientId,
  commandsPath,
  guildIds = [],
  client = null,
  mode = 'guild',
}) {
  if (!token) throw new Error('Missing bot token.');
  if (!clientId) throw new Error('Missing client ID.');
  if (!commandsPath) throw new Error('Missing commandsPath.');

  const rest = new REST({ version: '10' }).setToken(token);
  const commands = loadCommands(commandsPath, mode);

  console.log(`📦 Commands loaded (${mode}):`, commands.length);

  const start = Date.now();

  if (mode === 'global') {
    console.log('🌍 Registering GLOBAL commands...');

    await rest.put(Routes.applicationCommands(clientId), {
      body: commands,
    });

    const durationMs = Date.now() - start;

    console.log('✅ Global commands registered');

    return {
      synced: commands.length,
      scope: 'global',
      durationMs,
    };
  }

  const resolvedGuildIds = resolveGuildIds(guildIds, client);

  if (!resolvedGuildIds.length) {
    throw new Error('No guild IDs provided for guild mode.');
  }

  console.log('📡 Registering to guilds:', resolvedGuildIds);

  for (const guildId of resolvedGuildIds) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });

    console.log(`✅ Registered commands for guild: ${guildId}`);
  }

  const durationMs = Date.now() - start;

  return {
    synced: commands.length,
    guilds: resolvedGuildIds.length,
    scope: 'guild',
    durationMs,
  };
}

module.exports = {
  registerCommands,
};