require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} = require('discord.js');
const loadEvents = require('./src/handlers/eventHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

client.commands = new Collection();

function getCommandFiles(dir) {
  let results = [];

  if (!fs.existsSync(dir)) return results;

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

const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = getCommandFiles(commandsPath);

for (const filePath of commandFiles) {
  delete require.cache[require.resolve(filePath)];
  const command = require(filePath);

  if (command?.data && command?.execute) {
    client.commands.set(command.data.name, command);
    console.log(`✅ Loaded: ${command.data.name}`);
  } else {
    console.warn(`[WARNING] Invalid command file: ${filePath}`);
  }
}

loadEvents(client);

client.login(process.env.TOKEN);