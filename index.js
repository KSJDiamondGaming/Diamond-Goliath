require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} = require('discord.js');

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

/* ---------------- RECURSIVE FILE LOADERS ---------------- */

function getAllJsFiles(dir) {
  let results = [];

  if (!fs.existsSync(dir)) {
    console.warn(`⚠️ Folder not found: ${dir}`);
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results = results.concat(getAllJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }

  return results;
}

function loadCommands(client) {
  const commandsPath = path.join(__dirname, 'src', 'commands');
  const commandFiles = getAllJsFiles(commandsPath);

  console.log(`📂 Found ${commandFiles.length} command file(s)`);

  for (const filePath of commandFiles) {
    try {
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath);

      if (command?.data && typeof command.execute === 'function') {
        client.commands.set(command.data.name, command);
        console.log(`✅ Loaded command: ${command.data.name}`);
      } else {
        console.warn(`⚠️ Invalid command file: ${filePath}`);
      }
    } catch (error) {
      console.error(`❌ Failed to load command file: ${filePath}`);
      console.error(error);
    }
  }

  console.log(`📦 Total commands loaded: ${client.commands.size}`);
}

function loadEvents(client) {
  const eventsPath = path.join(__dirname, 'src', 'events');
  const eventFiles = getAllJsFiles(eventsPath);

  console.log(`📂 Found ${eventFiles.length} event file(s)`);

  for (const filePath of eventFiles) {
    try {
      delete require.cache[require.resolve(filePath)];
      const event = require(filePath);

      if (!event?.name || typeof event.execute !== 'function') {
        console.warn(`⚠️ Invalid event file: ${filePath}`);
        continue;
      }

      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }

      console.log(`✅ Loaded event: ${event.name} (${filePath})`);
    } catch (error) {
      console.error(`❌ Failed to load event file: ${filePath}`);
      console.error(error);
    }
  }
}

/* ---------------- BOT STARTUP ---------------- */

async function startBot() {
  try {
    console.log('🚀 Starting bot...');

    loadCommands(client);

    console.log('📡 Loading events...');
    loadEvents(client);
    console.log('✅ Events loaded');

    const token = process.env.TOKEN;

    console.log('🔐 TOKEN EXISTS:', !!token);
    console.log('🔐 TOKEN LENGTH:', token?.length || 0);

    if (!token) {
      throw new Error('Missing TOKEN in .env file');
    }

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

    startInternalApi();
  } catch (error) {
    console.error('❌ Fatal startup error:', error);
  }
}

/* ---------------- INTERNAL API ---------------- */

function startInternalApi() {
  const app = express();
  const PORT = Number(process.env.BOT_API_PORT) || 3002;

  app.get('/internal/status', (req, res) => {
    const ready = client.isReady();

    return res.json({
      ok: true,
      online: ready,
      ready,
      ping:
        ready && typeof client.ws?.ping === 'number' && Number.isFinite(client.ws.ping)
          ? Math.round(client.ws.ping)
          : null,
      guilds: client.guilds.cache.size,
      user: client.user
        ? {
            id: client.user.id,
            username: client.user.username,
            tag: client.user.tag ?? null,
            avatar: client.user.avatar ?? null,
            avatarUrl: client.user.displayAvatarURL({
              extension: 'png',
              size: 256,
              forceStatic: false,
            }),
          }
        : null,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/internal/guilds', (req, res) => {
    const guilds = client.guilds.cache
      .map((guild) => ({
        id: guild.id,
        name: guild.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.json(guilds);
  });

  app.get('/internal/guilds/:guildId/channels', async (req, res) => {
    try {
      const guild = client.guilds.cache.get(req.params.guildId);

      if (!guild) {
        return res.status(404).json({ error: 'Guild not found' });
      }

      const channels = guild.channels.cache.map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        position: channel.position,
      }));

      return res.json(channels);
    } catch (error) {
      console.error('❌ Failed to fetch channels:', error);
      return res.status(500).json({ error: 'Failed to fetch channels' });
    }
  });

  app.get('/internal/guilds/:guildId/members/count', async (req, res) => {
    try {
      const guild = client.guilds.cache.get(req.params.guildId);

      if (!guild) {
        return res.status(404).json({ error: 'Guild not found' });
      }

      const total =
        typeof guild.memberCount === 'number' && Number.isFinite(guild.memberCount)
          ? guild.memberCount
          : null;

      let humans = null;
      let bots = null;
      let fetched = false;

      try {
        console.log(`👥 Fetching members for ${guild.name} (${guild.id})`);

        await guild.members.fetch();

        humans = guild.members.cache.filter((member) => !member.user.bot).size;
        bots = guild.members.cache.filter((member) => member.user.bot).size;
        fetched = true;
      } catch (error) {
        console.error(
          `❌ Failed to fetch full member list for ${guild.name}:`,
          error.message
        );
      }

      return res.json({
        guildId: guild.id,
        total,
        humans,
        bots,
        fetched,
      });
    } catch (error) {
      console.error('❌ Failed to fetch member counts:', error);
      return res.status(500).json({ error: 'Failed to fetch member counts' });
    }
  });

  app.listen(PORT, () => {
    console.log(`🤖 Bot API running on http://localhost:${PORT}`);
  });
}

startBot();