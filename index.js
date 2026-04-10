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
const { startScheduler } = require('./src/utils/punishmentScheduler');
const stats = require('./src/utils/stats/statsManager');
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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
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
  console.log(
    `📍 Connected guilds: ${readyClient.guilds.cache
      .map((g) => `${g.name} (${g.id})`)
      .join(', ')}`
  );
  console.log(`🛠️ Command sync mode: guild`);
  console.log(`🏠 Target guild IDs: ${guildIds.join(', ')}`);

  const express = require('express');
  const botApi = express();

  botApi.get('/internal/guilds', (req, res) => {
    try {
      const guilds = client.guilds.cache.map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
      }));

      return res.json(guilds);
    } catch (error) {
      console.error('Failed to return bot guilds:', error);
      return res.status(500).json({ error: 'Failed to fetch bot guilds' });
    }
  });

  const BOT_API_PORT = process.env.BOT_API_PORT || 3002;

  botApi.listen(BOT_API_PORT, () => {
    console.log(`🤖 Bot internal API running on http://localhost:${BOT_API_PORT}`);
  });

  try {
    const commandsPath = path.join(__dirname, 'src', 'commands');

    await registerCommands({
      token,
      clientId,
      commandsPath,
      mode: 'global',
      clear: true,
    });

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
  stats.start(client);
  console.log('📊 Stats updater started.');
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      const handled = await handleStatsInteraction(interaction);
      if (handled) return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.warn(`⚠️ No command handler found for /${interaction.commandName}`);
      return;
    }

    await command.execute(interaction);
  } catch (error) {
    console.error(
      `❌ Error running interaction ${interaction.customId || interaction.commandName || 'unknown'}:`,
      error
    );

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: 'There was an error while executing this command.',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: 'There was an error while executing this command.',
          ephemeral: true,
        });
      }
    } catch (replyError) {
      console.error('❌ Failed to send error response:', replyError);
    }
  }
});

client.login(token);