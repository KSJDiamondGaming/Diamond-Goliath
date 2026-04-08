const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

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

function loadCommands(commandsPath) {
  const commandFiles = getCommandFiles(commandsPath);
  const commands = [];

  for (const filePath of commandFiles) {
    delete require.cache[require.resolve(filePath)];
    const command = require(filePath);

    if (!command?.data || !command?.execute) {
      console.warn(`⚠️ Skipping invalid command file: ${filePath}`);
      continue;
    }

    commands.push(command.data.toJSON());
    console.log(`✅ Loaded command for sync: ${command.data.name}`);
  }

  return commands;
}

async function registerCommands({
  token,
  clientId,
  commandsPath,
  guildIds = [],
  mode = 'global',
}) {
  if (!token) throw new Error('Missing bot token.');
  if (!clientId) throw new Error('Missing client ID.');

  const commands = loadCommands(commandsPath);
  const rest = new REST({ version: '10' }).setToken(token);

  if (mode === 'guild') {
    if (!guildIds.length) {
      throw new Error('Guild mode selected, but no guild IDs were provided.');
    }

    console.log(`🚀 Syncing ${commands.length} command(s) to ${guildIds.length} guild(s)...`);

    for (const guildId of guildIds) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );

      console.log(`✅ Synced commands to guild ${guildId}`);
    }

    console.log('✅ Guild command sync complete.');
    return;
  }

  console.log(`🚀 Syncing ${commands.length} global command(s)...`);

  await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );

  console.log('✅ Global command sync complete.');
}

module.exports = {
  registerCommands,
};