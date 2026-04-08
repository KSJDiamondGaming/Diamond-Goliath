require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  Client,
  Collection,
  GatewayIntentBits,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

global.client = client;

client.commands = new Collection();

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
const guildsDataPath = path.join(__dirname, 'src', 'data', 'guilds.json');

function ensureFile(filePath, fallback = '{}') {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, fallback, 'utf8');
  }
}

function syncGuildsData() {
  try {
    ensureFile(guildsDataPath, '{}');

    const guilds = {};

    for (const guild of client.guilds.cache.values()) {
      guilds[guild.id] = {
        id: guild.id,
        name: guild.name,
        icon: guild.icon
          ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
          : null,
        memberCount: guild.memberCount ?? 0,
      };
    }

    fs.writeFileSync(guildsDataPath, JSON.stringify(guilds, null, 2), 'utf8');
    console.log(`✅ Synced ${Object.keys(guilds).length} guild(s) to ${guildsDataPath}`);
  } catch (error) {
    console.error('❌ Failed to sync guilds.json:', error);
  }
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

const commandFiles = getCommandFiles(commandsPath);

for (const filePath of commandFiles) {
  const command = require(filePath);

  if (!command?.data?.name || !command?.execute) {
    console.log(`⚠️ Skipped invalid command: ${filePath}`);
    continue;
  }

  if (client.commands.has(command.data.name)) {
    console.log(`❌ Duplicate command name found: ${command.data.name} in ${filePath}`);
    continue;
  }

  client.commands.set(command.data.name, command);
  commands.push(command.data.toJSON());
  console.log(`✅ Loaded command: ${command.data.name}`);
}

const eventsPath = path.join(__dirname, 'src', 'events');

if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);

    if (!event?.name || !event?.execute) {
      console.log(`⚠️ Skipped invalid event: ${filePath}`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }

    console.log(`📌 Loaded event: ${event.name}`);
  }
}

client.once('clientReady', () => {
  console.log(`Logged in as: ${client.user.tag}`);
  console.log(`Bot ID: ${client.user.id}`);
  console.log(`ENV CLIENT_ID: ${process.env.CLIENT_ID}`);

  syncGuildsData();
});

client.on('guildCreate', (guild) => {
  console.log(`➕ Joined guild: ${guild.name} (${guild.id})`);
  syncGuildsData();
});

client.on('guildDelete', (guild) => {
  console.log(`➖ Removed from guild: ${guild.name} (${guild.id})`);
  syncGuildsData();
});

client.login(process.env.TOKEN);