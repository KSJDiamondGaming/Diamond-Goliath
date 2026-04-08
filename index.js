require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Events,
} = require('discord.js');

const { registerCommands } = require('./src/utils/registerCommands');

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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
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

client.once(Events.ClientReady, async readyClient => {
  console.log(`🤖 Logged in as ${readyClient.user.tag}`);

  try {
    const isDev = process.env.NODE_ENV !== 'production';

    await registerCommands({
      token,
      clientId,
      commandsPath: path.join(__dirname, 'src', 'commands'),
      guildIds,
      mode: isDev ? 'guild' : 'global',
    });

    console.log(`✅ Startup command sync finished in ${isDev ? 'guild' : 'global'} mode.`);
  } catch (error) {
    console.error('❌ Command sync failed on startup:', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
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

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'There was an error while executing this command.',
        ephemeral: true,
      }).catch(() => null);
    } else {
      await interaction.reply({
        content: 'There was an error while executing this command.',
        ephemeral: true,
      }).catch(() => null);
    }
  }
});

const { startScheduler } = require('./src/utils/punishmentScheduler');

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  startScheduler(client);
});

client.login(token);