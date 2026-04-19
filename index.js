require('dotenv').config();

const terminal = require('./src/utils/utility/terminalLogger');

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} = require('discord.js');

process.on('unhandledRejection', (reason) => {
  terminal.error('Unhandled promise rejection', reason);
});

process.on('uncaughtException', (error) => {
  terminal.error('Uncaught exception', error);
});

process.on('uncaughtExceptionMonitor', (error) => {
  terminal.error('Uncaught exception monitor', error);
});

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
client.isBooting = true;
client.apiStarted = false;

/* ---------------- RECURSIVE FILE LOADERS ---------------- */

function getAllJsFiles(dir) {
  let results = [];

  if (!fs.existsSync(dir)) {
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

  return results.sort((a, b) => a.localeCompare(b));
}

function loadCommands(client) {
  const commandsPath = path.join(__dirname, 'src', 'commands');
  const commandFiles = getAllJsFiles(commandsPath);

  let loaded = 0;

  for (const filePath of commandFiles) {
    try {
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath);

      if (!command?.data || typeof command.execute !== 'function') {
        terminal.warn(`Skipping invalid command module: ${filePath}`);
        continue;
      }

      if (client.commands.has(command.data.name)) {
        terminal.warn(
          `Duplicate command name detected: ${command.data.name} (${filePath})`
        );
        continue;
      }

      client.commands.set(command.data.name, command);
      loaded++;
      terminal.line('✅ Command Loaded', `${command.data.name} -> ${filePath}`);
    } catch (error) {
      terminal.error(`Failed to load command file: ${filePath}`, error);
    }
  }

  return {
    found: commandFiles.length,
    loaded,
  };
}

function loadEvents(client) {
  const eventsPath = path.join(__dirname, 'src', 'events');
  const eventFiles = getAllJsFiles(eventsPath);

  let loaded = 0;
  const seenEventFiles = new Set();
  const seenEventBindings = new Set();

  for (const filePath of eventFiles) {
    try {
      terminal.line('📦 Event Loader', filePath);

      const normalizedPath = path.normalize(filePath).toLowerCase();
      if (seenEventFiles.has(normalizedPath)) {
        terminal.warn(`Skipping duplicate event file path: ${filePath}`);
        continue;
      }
      seenEventFiles.add(normalizedPath);

      delete require.cache[require.resolve(filePath)];
      const event = require(filePath);

      if (!event?.name || typeof event.execute !== 'function') {
        terminal.warn(`Skipping invalid event module: ${filePath}`);
        continue;
      }

      const bindingKey = `${event.name}:${event.once ? 'once' : 'on'}`;
      if (seenEventBindings.has(bindingKey)) {
        terminal.warn(
          `Skipping duplicate event binding: ${event.name} (${filePath})`
        );
        continue;
      }
      seenEventBindings.add(bindingKey);

      const handler = async (...args) => {
        try {
          await event.execute(...args);
        } catch (error) {
          terminal.error(`Event handler failed: ${event.name}`, error);
        }
      };

      if (event.once) {
        client.once(event.name, handler);
      } else {
        client.on(event.name, handler);
      }

      const listenerCount = client.listeners(event.name).length;
      terminal.line(
        '🧩 Event Bound',
        `${event.name} -> listeners: ${listenerCount}`
      );

      loaded++;
    } catch (error) {
      terminal.error(`Failed to load event file: ${filePath}`, error);
    }
  }

  return {
    found: eventFiles.length,
    loaded,
  };
}

/* ---------------- BOT STARTUP ---------------- */

async function startBot() {
  try {
    terminal.start();

    const commandStats = loadCommands(client);
    const eventStats = loadEvents(client);

    const token = process.env.TOKEN;
    if (!token) {
      throw new Error('Missing TOKEN in .env file');
    }

    client.on('warn', (warning) => {
      terminal.warn(`Discord client warning: ${warning}`);
    });

    client.on('error', (error) => {
      terminal.error('Discord client error', error);
    });

    client.once('clientReady', () => {
      client.isBooting = false;
      terminal.line(
        '🤖 Bot',
        `READY (${commandStats.loaded} cmds, ${eventStats.loaded} events)`
      );

      terminal.line(
        '🧪 interactionCreate listeners',
        String(client.listeners('interactionCreate').length)
      );

      if (!client.apiStarted) {
        startInternalApi();
        client.apiStarted = true;
      }
    });

    await client.login(token);
  } catch (error) {
    terminal.error('Fatal startup error', error);
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
      booting: client.isBooting,
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
      terminal.error('Failed to fetch channels', error);
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

      const cachedMembers = guild.members.cache;
      const humans = cachedMembers.filter((member) => !member.user.bot).size;
      const bots = cachedMembers.filter((member) => member.user.bot).size;

      return res.json({
        guildId: guild.id,
        total,
        humans,
        bots,
        fetched: false,
        cached: true,
      });
    } catch (error) {
      terminal.error('Failed to fetch member counts', error);
      return res.status(500).json({ error: 'Failed to fetch member counts' });
    }
  });

  app.listen(PORT, () => {
    terminal.line('🌐 API', `http://localhost:${PORT}`);
  });
}

startBot();

module.exports = client;