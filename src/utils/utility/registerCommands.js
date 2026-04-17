const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

/* ---------------- FILE LOADER ---------------- */

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

  return results;
}

function loadCommands(commandsPath) {
  const commandFiles = getCommandFiles(commandsPath);
  const commands = [];

  for (const filePath of commandFiles) {
    try {
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath);

      if (!command?.data || typeof command.execute !== 'function') {
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

/* ---------------- GUILD RESOLVER ---------------- */

function resolveGuildIds(guildIds, client) {
  if (Array.isArray(guildIds) && guildIds.length) {
    return guildIds.map((id) => String(id).trim()).filter(Boolean);
  }

  if (process.env.GUILD_IDS) {
    return process.env.GUILD_IDS
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  if (process.env.GUILD_ID) {
    return [process.env.GUILD_ID.trim()].filter(Boolean);
  }

  if (client?.guilds?.cache?.size) {
    return client.guilds.cache.map((guild) => guild.id);
  }

  return [];
}

/* ---------------- SAFE REQUEST ---------------- */

async function putWithTimeout(rest, route, body, timeoutMs = 120000) {
  return Promise.race([
    rest.put(route, { body }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/* ---------------- MAIN FUNCTION ---------------- */

async function registerCommands({
  token,
  clientId,
  commandsPath,
  guildIds = [],
  client = null,
  clear = false,
  mode = 'guild', // 👈 NEW
}) {
  if (!token) throw new Error('Missing bot token.');
  if (!clientId) throw new Error('Missing client ID.');
  if (!commandsPath) throw new Error('Missing commandsPath.');

  const rest = new REST({ version: '10' }).setToken(token);
  const commands = loadCommands(commandsPath);

  console.log('📦 Commands loaded:', commands.length);

  const start = Date.now();

  /* ---------------- GLOBAL MODE ---------------- */

  if (mode === 'global') {
    const route = Routes.applicationCommands(clientId);

    console.log('🌍 Registering GLOBAL commands...');

    if (clear) {
      console.log('🧹 Clearing GLOBAL commands...');
      await putWithTimeout(rest, route, [], 30000);
    }

    await putWithTimeout(rest, route, commands, 120000);

    const durationMs = Date.now() - start;

    console.log('✅ Global commands registered');

    return {
      synced: commands.length,
      scope: 'global',
      durationMs,
    };
  }

  /* ---------------- GUILD MODE ---------------- */

  const resolvedGuildIds = resolveGuildIds(guildIds, client);

  if (!resolvedGuildIds.length) {
    throw new Error('No guild IDs provided for guild mode.');
  }

  console.log('📡 Registering to guilds:', resolvedGuildIds);

  for (const guildId of resolvedGuildIds) {
    const route = Routes.applicationGuildCommands(clientId, guildId);

    if (clear) {
      console.log(`🧹 Clearing commands for guild: ${guildId}`);
      await putWithTimeout(rest, route, [], 30000);
    }

    await putWithTimeout(rest, route, commands, 120000);

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