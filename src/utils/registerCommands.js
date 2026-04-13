const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

/**
 * Recursively get all command files
 */
function getCommandFiles(dir) {
  let results = [];

  if (!fs.existsSync(dir)) return results;

  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      results = results.concat(getCommandFiles(filePath));
    } else if (file.endsWith('.js')) {
      results.push(filePath);
    }
  }

  return results;
}

/**
 * Load commands from files
 */
function loadCommands(commandsPath) {
  const commandFiles = getCommandFiles(commandsPath);
  const commands = [];

  console.log(`📂 Found ${commandFiles.length} command file(s) for sync`);

  for (const filePath of commandFiles) {
    delete require.cache[require.resolve(filePath)];
    const command = require(filePath);

    if (!command?.data || !command?.execute) {
      console.warn(`⚠️ Skipping invalid command file: ${filePath}`);
      continue;
    }

    commands.push(command.data.toJSON());
    console.log(`✅ Prepared: ${command.data.name}`);
  }

  return commands;
}

/**
 * Clear ALL guild commands
 */
async function clearGuildCommands(rest, clientId, guildIds) {
  console.log(`🧹 Clearing commands from ${guildIds.length} guild(s)...`);

  for (const guildId of guildIds) {
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: [] }
    );

    console.log(`🧹 Cleared guild ${guildId}`);
  }

  console.log('✅ Guild command wipe complete.');
}

/**
 * Main register function (AUTO CLEARS FIRST)
 */
async function registerCommands({
  token,
  clientId,
  commandsPath,
  guildIds = [],
}) {
  if (!token) throw new Error('Missing bot token.');
  if (!clientId) throw new Error('Missing client ID.');
  if (!guildIds.length) throw new Error('No guild IDs provided.');

  const rest = new REST({ version: '10' }).setToken(token);

  await registerCommands({
  token: process.env.TOKEN,
  clientId: process.env.CLIENT_ID,
  commandsPath,
  guildIds,
  clear: true // 👈 ONLY THIS
  });

  // 🔥 STEP 1: CLEAR OLD COMMANDS
  await clearGuildCommands(rest, clientId, guildIds);

  // 🔥 STEP 2: LOAD NEW COMMANDS
  const commands = loadCommands(commandsPath);

  console.log(`🚀 Registering ${commands.length} command(s)...`);

  // 🔥 STEP 3: REGISTER FRESH
  for (const guildId of guildIds) {
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log(`✅ Synced to guild ${guildId}`);
  }

  console.log('🎉 Command sync complete.');
}

module.exports = {
  registerCommands,
};