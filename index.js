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
const stats = require('./src/utils/stats/statsManager');

let embedPanelHandler = null;
try {
  embedPanelHandler = require('./src/utils/embed/embedPanelInteraction');
  console.log('✅ Embed panel handler loaded');
} catch (err) {
  console.warn('⚠️ Embed panel handler missing');
}

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildIds = process.env.GUILD_IDS
  ? process.env.GUILD_IDS.split(',').map(id => id.trim()).filter(Boolean)
  : [];

if (!token) throw new Error('Missing TOKEN');
if (!clientId) throw new Error('Missing CLIENT_ID');
if (!guildIds.length) throw new Error('Missing GUILD_IDS');

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

function loadRuntimeCommands() {
  const commandsPath = path.join(__dirname, 'src', 'commands');
  const files = getCommandFiles(commandsPath);

  for (const filePath of files) {
    delete require.cache[require.resolve(filePath)];
    const command = require(filePath);

    if (!command?.data || !command?.execute) continue;

    client.commands.set(command.data.name, command);
    console.log(`✅ Loaded: ${command.data.name}`);
  }
}

async function handleComponents(interaction) {
  if (
    !interaction.isButton() &&
    !interaction.isStringSelectMenu() &&
    !interaction.isModalSubmit()
  ) return false;

  // stats
  if (stats?.handleInteraction) {
    if (await stats.handleInteraction(interaction)) return true;
  }

  // embed panel
  if (interaction.customId?.startsWith('embedpanel_') && embedPanelHandler) {
    return await embedPanelHandler(interaction, client);
  }

  return false;
}

loadRuntimeCommands();

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`🤖 Logged in as ${readyClient.user.tag}`);

  const express = require('express');
  const botApi = express();

  botApi.get('/internal/guilds', (req, res) => {
    const guilds = client.guilds.cache.map(g => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
    }));
    res.json(guilds);
  });

  botApi.listen(3002, () => {
    console.log(`🤖 API running on http://localhost:3002`);
  });

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

  startScheduler(client);
  stats.start(client);

  console.log('🚀 Bot ready');
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (await handleComponents(interaction)) return;

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    await command.execute(interaction, client);

  } catch (err) {
    console.error('❌ Interaction error:', err);

    const payload = {
      content: 'Something went wrong.',
      flags: MessageFlags.Ephemeral,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.login(token);