const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const session = require('express-session');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');

const { loadEnvironment } = require('./src/config/envLoader');
loadEnvironment();

function safeRequire(label, modulePath, fallback = null) {
  try {
    return require(modulePath);
  } catch (error) {
    console.warn(`⚠️ Optional startup module skipped: ${label}`);
    console.warn(error?.message || error);
    return fallback;
  }
}

function emptyRouter() {
  return express.Router();
}

const { getBotModeConfig } = safeRequire('botModes', './src/config/botModes', { getBotModeConfig: () => ({ token: process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN }) });
const { enforceGuildAccess } = safeRequire('guildAccess', './src/config/guildAccess', { enforceGuildAccess: async () => true });
const { bootstrapRuntime, runBootValidation, safeLoad, printStartupFingerprint } = safeRequire('runtimeBootstrap', './src/runtime/runtimeBootstrap', {
  bootstrapRuntime: () => ({}),
  runBootValidation: () => true,
  safeLoad: (label, fn) => { try { return { ok: true, result: fn() }; } catch (error) { console.warn(`⚠️ ${label} skipped`, error?.message || error); return { ok: false, result: null, error }; } },
  printStartupFingerprint: () => null,
});
const { initSocketHub } = safeRequire('socketHub', './src/server/sockets/socketHub', { initSocketHub: () => null });

const authRoutes = safeRequire('auth routes', './src/server/routes/auth', emptyRouter());
const discordRoutes = safeRequire('discord routes', './src/server/routes/discord', emptyRouter());
const discordRoleEditorRoutes = safeRequire('discord role editor routes', './src/server/routes/discordRoleEditor', emptyRouter());
const discordResourceRoutes = safeRequire('discord resource routes', './src/server/routes/discordResources', emptyRouter());
const statusRoutes = safeRequire('status routes', './src/server/routes/status', emptyRouter());
const ownerRoutes = safeRequire('owner routes', './src/server/routes/owner', emptyRouter());
const ownerDiagnosticsRoutes = safeRequire('owner diagnostics routes', './src/server/routes/ownerDiagnostics', emptyRouter());
const ownerTranslationRoutes = safeRequire('owner translation routes', './src/server/routes/ownerTranslation', emptyRouter());
const automodRoutes = safeRequire('automod routes', './src/server/routes/config/automod', emptyRouter());
const generalSettingsRoutes = safeRequire('general settings routes', './src/server/routes/config/generalSettings', emptyRouter());
const logsRoutes = safeRequire('logs routes', './src/server/routes/config/logs', emptyRouter());
const messagesRoutes = safeRequire('messages routes', './src/server/routes/config/messages', emptyRouter());
const embedsRoutes = safeRequire('embeds routes', './src/server/routes/config/embeds', emptyRouter());
const billingRoutes = safeRequire('billing routes', './src/server/routes/billing', emptyRouter());
const moderationRoutes = safeRequire('moderation routes', './src/server/routes/moderation', emptyRouter());
const serverRestoreRoutes = safeRequire('restore routes', './src/server/routes/serverRestoreRoutes', emptyRouter());
const securityRoutes = safeRequire('security routes', './src/server/routes/security', emptyRouter());
const ticketRoutes = safeRequire('ticket routes', './src/server/routes/tickets', emptyRouter());
const formsRoutes = safeRequire('forms routes', './src/server/routes/forms', emptyRouter());
const transcriptRoutes = safeRequire('transcript routes', './src/server/routes/transcripts', emptyRouter());
const translationRoutes = safeRequire('translation routes', './src/server/routes/translation', emptyRouter());
const permissionHealthRoutes = safeRequire('permission health routes', './src/server/routes/permissionHealth', emptyRouter());
const socialRoutes = safeRequire('social routes', './src/server/routes/social', emptyRouter());
const modulesRoutes = safeRequire('modules routes', './src/server/routes/modules', emptyRouter());
const pollsRoutes = safeRequire('polls routes', './src/server/routes/polls', emptyRouter());
const statsRoutes = safeRequire('stats routes', './src/server/routes/stats', emptyRouter());
const tempVoiceRoutes = safeRequire('temp voice routes', './src/server/routes/tempVoice', emptyRouter());
const starboardRoutes = safeRequire('starboard routes', './src/server/routes/starboard', emptyRouter());
const deploymentRoutes = safeRequire('deployment routes', './src/server/routes/deployments', emptyRouter());
const ownerDeploymentRoutes = safeRequire('owner deployment routes', './src/server/routes/ownerDeployments', emptyRouter());
const ownerEmbedRoutes = safeRequire('owner embed routes', './src/server/routes/ownerEmbeds', emptyRouter());
const ownerTicketRoutes = safeRequire('owner ticket routes', './src/server/routes/ownerTickets', emptyRouter());
const ownerOperationsRoutes = safeRequire('owner operations routes', './src/server/routes/ownerOperations', emptyRouter());
const ownerPermissionsRoutes = safeRequire('owner permissions routes', './src/server/routes/ownerPermissions', emptyRouter());
const ownerSecurityRoutes = safeRequire('owner security routes', './src/server/routes/ownerSecurity', emptyRouter());
const ownerSubscriptionRoutes = safeRequire('owner subscription routes', './src/server/routes/ownerSubscription', emptyRouter());

const commandHandler = safeRequire('command handler', './src/handlers/commandHandler', { loadCommands: () => null });
const backupScheduler = safeRequire('backup scheduler', './src/core/backup/backupScheduler', { startBackupScheduler: () => null });
const defaultModules = safeRequire('default modules', './src/core/guild/defaultModules', { initializeDefaultModules: () => null });
const guildManager = safeRequire('guild manager', './src/core/guild/guildManager', { syncGuildMeta: () => null });
const resourceManager = safeRequire('discord resource manager', './src/core/guild/discordResourceManager', { syncDiscordResources: async () => null });

const config = getBotModeConfig();
const botMode = String(config?.mode || process.env.BOT_MODE || 'DEV').toUpperCase();
const PORT = Number(process.env.PORT || process.env.BOT_API_PORT || 3001);
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.DASHBOARD_SESSION_SECRET || 'goliath-dev-session-secret';
const isProduction = process.env.NODE_ENV === 'production';

const runtimePaths = bootstrapRuntime(config);
printStartupFingerprint(config, runtimePaths);
runBootValidation({ requiredPaths: [], requiredEnv: [] });

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildInvites, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});
client.commands = new Collection();

const app = express();
const server = http.createServer(app);
const io = initSocketHub(server) || null;

app.set('trust proxy', 1);
app.set('goliath.client', client);
app.set('goliath.io', io);

const allowedOrigins = new Set(['https://goliath.ksjdigital.co.uk', 'https://dev.goliath.ksjdigital.co.uk', 'http://localhost:5173']);
[process.env.CLIENT_URL, process.env.DASHBOARD_CLIENT_URL, process.env.DASHBOARD_URL, process.env.VITE_CLIENT_URL].filter(Boolean).forEach((origin) => allowedOrigins.add(String(origin).trim()));

app.use(cors({ origin(origin, callback) { if (!origin || allowedOrigins.has(origin)) return callback(null, true); return callback(new Error(`CORS blocked origin: ${origin}`)); }, credentials: true }));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { secure: isProduction, httpOnly: true, sameSite: isProduction ? 'none' : 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 } }));
app.use((req, res, next) => { req.client = client; req.io = io; next(); });

app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/discord', discordRoutes);
app.use('/api/discord', discordRoleEditorRoutes);
app.use('/api/discord', discordResourceRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/owner/diagnostics', ownerDiagnosticsRoutes);
app.use('/api/owner/translation', ownerTranslationRoutes);
app.use('/api/config/automod', automodRoutes);
app.use('/api/config/general', generalSettingsRoutes);
app.use('/api/config/logs', logsRoutes);
app.use('/api/config/messages', messagesRoutes);
app.use('/api/config/embeds', embedsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/cases', moderationRoutes);
app.use('/api/restore', serverRestoreRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/forms', formsRoutes);
app.use('/api/transcripts', transcriptRoutes);
app.use('/api/translation', translationRoutes);
app.use('/api/permissions', permissionHealthRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/modules', modulesRoutes);
app.use('/api/polls', pollsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/temp-voice', tempVoiceRoutes);
app.use('/api/starboard', starboardRoutes);
app.use('/api/deployments', deploymentRoutes);
app.use('/api/owner/deployments', ownerDeploymentRoutes);
app.use('/api/resources', discordResourceRoutes);
app.use('/api/owner/embeds', ownerEmbedRoutes);
app.use('/api/owner/tickets', ownerTicketRoutes);
app.use('/api/owner/operations', ownerOperationsRoutes);
app.use('/api/owner/permissions', ownerPermissionsRoutes);
app.use('/api/owner/security', ownerSecurityRoutes);
app.use('/api/owner/subscription', ownerSubscriptionRoutes);

const dashboardDist = path.join(process.cwd(), 'dist');
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    return res.sendFile(path.join(dashboardDist, 'index.html'));
  });
}

safeLoad('commands', () => commandHandler.loadCommands(client));

function registerEvents() {
  const eventsPath = path.join(process.cwd(), 'src', 'events');
  if (!fs.existsSync(eventsPath)) return;
  const files = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  });
  walk(eventsPath);
  for (const file of files) {
    try {
      const loaded = require(file);
      const handlers = Array.isArray(loaded) ? loaded : [loaded];
      for (const handler of handlers) {
        if (!handler?.name || typeof handler.execute !== 'function') continue;
        client.on(handler.name, (...args) => handler.execute(...args, client));
      }
    } catch (error) {
      console.warn(`⚠️ Event skipped: ${file}`);
      console.warn(error?.message || error);
    }
  }
}

registerEvents();

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) {
    try {
      await enforceGuildAccess(guild, botMode, config);
      defaultModules.initializeDefaultModules?.(guild.id);
      guildManager.syncGuildMeta?.(guild);
      await resourceManager.syncDiscordResources?.(guild);
    } catch (error) {
      console.error(`❌ Guild startup sync failed for ${guild.id}`, error);
    }
  }
  backupScheduler.startBackupScheduler?.(client);
});

server.listen(PORT, () => console.log(`🚀 Goliath dashboard/server listening on port ${PORT}`));

const token = config.token || process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN;
if (!token) {
  console.error('❌ Missing Discord bot token');
  process.exit(1);
}

client.login(token).catch((error) => {
  console.error('❌ Discord login failed');
  console.error(error);
  process.exit(1);
});
