require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildIds = process.env.GUILD_IDS
  ? process.env.GUILD_IDS.split(',').map(id => id.trim()).filter(Boolean)
  : [];

if (!token) {
  throw new Error('Missing TOKEN in .env');
}

if (!clientId) {
  throw new Error('Missing CLIENT_ID in .env');
}

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

async function deployCommands() {
  const commands = [];
  const commandsPath = path.join(__dirname, 'src', 'commands');
  const commandFiles = getCommandFiles(commandsPath);

  for (const filePath of commandFiles) {
    const command = require(filePath);

    if (!command?.data || !command?.execute) {
      console.warn(`⚠️ Skipping invalid command file: ${filePath}`);
      continue;
    }

    commands.push(command.data.toJSON());
    console.log(`✅ Prepared command: ${command.data.name}`);
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const mode = process.argv[2];

  if (mode === 'guild') {
    if (!guildIds.length) {
      throw new Error('No GUILD_IDS found in .env for guild deploy mode.');
    }

    console.log(`🚀 Deploying ${commands.length} command(s) to ${guildIds.length} guild(s)...`);

    for (const guildId of guildIds) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );

      console.log(`✅ Guild commands deployed successfully to guild ${guildId}`);
    }

    console.log('✅ All guild commands deployed successfully.');
  } else if (mode === 'global') {
    console.log(`🚀 Deploying ${commands.length} global command(s)...`);

    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );

    console.log('✅ Global commands deployed successfully.');
  } else {
    console.log('⚠️ Please specify a deploy mode:');
    console.log('   node deploy-commands.js guild');
    console.log('   node deploy-commands.js global');
    process.exit(0);
  }
}

deployCommands().catch((error) => {
  console.error('❌ Failed to deploy commands:', error);
  process.exit(1);
});