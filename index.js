require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} = require('discord.js');

const loadEvents = require('./src/events/handlers/eventHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
  ],
});

client.commands = new Collection();

function getCommandFiles(dir) {
  let results = [];

  if (!fs.existsSync(dir)) {
    console.warn(`⚠️ Commands folder not found: ${dir}`);
    return results;
  }

  for (const file of fs.readdirSync(dir)) {
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

async function startBot() {
  try {
    console.log('🚀 Starting bot...');

    const commandsPath = path.join(__dirname, 'src', 'commands');
    const commandFiles = getCommandFiles(commandsPath);

    console.log(`📂 Found ${commandFiles.length} command file(s)`);

    for (const filePath of commandFiles) {
      try {
        delete require.cache[require.resolve(filePath)];
        const command = require(filePath);

        if (command?.data && command?.execute) {
          client.commands.set(command.data.name, command);
          console.log(`✅ Loaded: ${command.data.name}`);
        } else {
          console.warn(`⚠️ Invalid command file: ${filePath}`);
        }
      } catch (error) {
        console.error(`❌ Failed to load command file: ${filePath}`);
        console.error(error);
      }
    }

    console.log(`📦 Total commands loaded: ${client.commands.size}`);

    console.log('📡 Loading events...');
    await loadEvents(client);
    console.log('✅ Events loaded');

    const token = process.env.TOKEN;

    console.log('🔐 TOKEN EXISTS:', !!token);
    console.log('🔐 TOKEN LENGTH:', token?.length || 0);

    if (!token) {
      throw new Error('Missing TOKEN in .env file');
    }

    client.once('clientReady', () => {
      console.log(`🤖 Logged in as ${client.user.tag}`);
      console.log(`🆔 Bot ID: ${client.user.id}`);

      if (client.guilds.cache.size > 0) {
        console.log('📍 Connected guilds:');
        for (const guild of client.guilds.cache.values()) {
          console.log(`- ${guild.name} (${guild.id})`);
        }
      } else {
        console.log('📍 No guilds connected');
      }
    });

    client.on('warn', (warning) => {
      console.warn('⚠️ Discord client warning:', warning);
    });

    client.on('error', (error) => {
      console.error('❌ Discord client error:', error);
    });

    process.on('unhandledRejection', (reason) => {
      console.error('❌ Unhandled promise rejection:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught exception:', error);
    });

    console.log('🔑 About to login...');
    await client.login(token);
    console.log('✅ Login promise resolved');
  } catch (error) {
    console.error('❌ Fatal startup error:', error);
  }
}

startBot();