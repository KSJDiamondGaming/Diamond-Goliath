require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Events,
  MessageFlags,
} = require('discord.js');

const { registerCommands } = require('./src/utils/registerCommands');
const { startScheduler } = require('./src/utils/punishmentScheduler');

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildIds = process.env.GUILD_IDS
  ? process.env.GUILD_IDS.split(',').map((id) => id.trim()).filter(Boolean)
  : [];

if (!token) {
  throw new Error('Missing TOKEN in .env');
}

if (!clientId) {
  throw new Error('Missing CLIENT_ID in .env');
}

if (!guildIds.length) {
  throw new Error('Missing GUILD_IDS in .env');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

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

function loadRuntimeCommands() {
  const commandsPath = path.join(__dirname, 'src', 'commands');
  const commandFiles = getCommandFiles(commandsPath);

  for (const filePath of commandFiles) {
    delete require.cache[require.resolve(filePath)];
    const command = require(filePath);

    if (!command?.data || !command?.execute) {
      console.warn(`⚠️ Skipping invalid command file: ${filePath}`);
      continue;
    }

    client.commands.set(command.data.name, command);
    console.log(`✅ Runtime command loaded: ${command.data.name}`);
  }
}

loadRuntimeCommands();

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`🤖 Logged in as ${readyClient.user.tag}`);
  console.log(`📍 Connected guilds: ${readyClient.guilds.cache.map((g) => `${g.name} (${g.id})`).join(', ')}`);
  console.log(`🛠️ Command sync mode: guild`);
  console.log(`🏠 Target guild IDs: ${guildIds.join(', ')}`);

  try {
    const commandsPath = path.join(__dirname, 'src', 'commands');

    // Clear old global commands so duplicate slash commands do not come back.
    await registerCommands({
      token,
      clientId,
      commandsPath,
      mode: 'global',
      clear: true,
    });

    // Register only guild commands for development/stability.
    await registerCommands({
      token,
      clientId,
      commandsPath,
      guildIds,
      mode: 'guild',
    });

    console.log('✅ Cleared global commands and synced guild commands.');
  } catch (error) {
    console.error('❌ Command sync failed on startup:', error);
  }

  startScheduler(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.warn(`⚠️ No command handler found for /${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Error running /${interaction.commandName}:`, error);

    if (interaction.deferred || interaction.replied) {
      await interaction
        .followUp({
          content: 'There was an error while executing this command.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => null);
    } else {
      await interaction
        .reply({
          content: 'There was an error while executing this command.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => null);
    }
  }
});

client.login(token);