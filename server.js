const fs = require('fs');
const path = require('path');

const { loadEnvironment } = require('./src/config/envLoader');

loadEnvironment();

const express = require('express');
const http = require('http');
const cors = require('cors');
const session = require('express-session');

const {
Client,
Collection,
GatewayIntentBits,
Partials,
} = require('discord.js');

const { getBotModeConfig } = require('./src/config/botModes');

const {
enforceGuildAccess,
} = require('./src/config/guildAccess');

const {
bootstrapRuntime,
runBootValidation,
safeLoad,
printStartupFingerprint,
} = require('./src/runtime/runtimeBootstrap');

const { initSocketHub } = require('./src/server/sockets/socketHub');

const authRoutes = require('./src/server/routes/auth');
const discordRoutes = require('./src/server/routes/discord');
const statusRoutes = require('./src/server/routes/status');
const ownerRoutes = require('./src/server/routes/owner');

const automodRoutes = require('./src/server/routes/config/automod');
const generalSettingsRoutes = require('./src/server/routes/config/generalSettings');
const logsRoutes = require('./src/server/routes/config/logs');
const messagesRoutes = require('./src/server/routes/config/messages');
const embedsRoutes = require('./src/server/routes/config/embeds');

const moderationRoutes = require('./src/server/routes/moderation');
const serverRestoreRoutes = require('./src/server/routes/serverRestoreRoutes');
const securityRoutes = require('./src/server/routes/security');
const ticketRoutes = require('./src/server/routes/tickets');
const formsRoutes = require('./src/server/routes/forms');
const translationRoutes = require('./src/server/routes/translation');
const modulesRoutes = require('./src/server/routes/modules');

/* ---------------- SAFE MODULE LOADS ---------------- */

const backupSchedulerModule = safeLoad(
'Server Backup Scheduler',
() => require('./src/security/serverBackupScheduler'),
);

const startServerBackupScheduler =
backupSchedulerModule.ok &&
typeof backupSchedulerModule.result?.startServerBackupScheduler === 'function'
? backupSchedulerModule.result.startServerBackupScheduler
: null;

/* ---------------- ENV / MODE ---------------- */

const ALLOWED_MODES = ['dev', 'beta', 'production'];

function resolveBotMode() {
const argMode = process.argv[2]?.toLowerCase();
const envMode = process.env.BOT_MODE?.toLowerCase();

if (ALLOWED_MODES.includes(argMode)) return argMode;
if (ALLOWED_MODES.includes(envMode)) return envMode;

return 'dev';
}

const selectedMode = resolveBotMode();

process.env.BOT_MODE = selectedMode;

const loadedEnv = loadEnvironment(selectedMode);
const BOT_MODE = selectedMode.toUpperCase();
const activeMode = getBotModeConfig(BOT_MODE);

const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_TOKEN) {
process.env.DISCORD_BOT_TOKEN = process.env.DISCORD_TOKEN;
}

if (!process.env.TOKEN && process.env.DISCORD_TOKEN) {
process.env.TOKEN = process.env.DISCORD_TOKEN;
}

/* ---------------- CLIENT ---------------- */

const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMembers,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent,
],
partials: [Partials.Channel, Partials.Message],
});

client.commands = new Collection();
client.botMode = BOT_MODE;
client.modeConfig = activeMode;

/* ---------------- HELPERS ---------------- */

function getRequiredEnv(name) {
const value = process.env[name];

if (!value || !String(value).trim()) {
console.error(`❌ Missing required environment variable: ${name}`);
process.exit(1);
}

return value;
}

function getAllJsFiles(dir) {
if (!fs.existsSync(dir)) return [];

const results = [];

for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
const fullPath = path.join(dir, entry.name);

if (entry.isDirectory()) {
  results.push(...getAllJsFiles(fullPath));
  continue;
}

if (
  entry.isFile() &&
  entry.name.endsWith('.js') &&
  !entry.name.endsWith('.test.js') &&
  !entry.name.endsWith('.spec.js')
) {
  results.push(fullPath);
}
}

return results.sort((a, b) => a.localeCompare(b));
}

function printStartupBanner() {
const modeLabels = {
DEV: '🟢 GOLIATH DEV',
BETA: '🟡 GOLIATH BETA',
PRODUCTION: '🔴 GOLIATH PRODUCTION',
};

console.log('============================================================');
console.log(`🚀 Starting ${modeLabels[BOT_MODE] || 'Goliath'}`);
console.log(`🧠 Mode: ${BOT_MODE}`);
console.log(`📄 Env: ${loadedEnv.envFile}`);
console.log('============================================================');
}

/* ---------------- DASHBOARD API ---------------- */

function getAllowedOrigins() {
const origins = new Set([
'https://goliath.ksjdigital.co.uk',
'http://localhost:5173',
]);

const envOrigins = [
process.env.CLIENT_URL,
process.env.DASHBOARD_CLIENT_URL,
process.env.VITE_CLIENT_URL,
];

for (const origin of envOrigins) {
if (origin && String(origin).trim()) {
origins.add(String(origin).trim());
}
}

return [...origins];
}

function getDashboardClientUrl() {
return String(
process.env.CLIENT_URL ||
process.env.DASHBOARD_CLIENT_URL ||
process.env.VITE_CLIENT_URL ||
'https://goliath.ksjdigital.co.uk',
).trim();
}

function startDashboardApiServer() {
const app = express();
const apiServer = http.createServer(app);

app.locals.client = client;
app.locals.discordClient = client;

global.client = client;
global.discordClient = client;

const allowedOrigins = getAllowedOrigins();
const dashboardClientUrl = getDashboardClientUrl();

app.set('trust proxy', 1);

app.use(
cors({
origin(origin, callback) {
if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
}),
);

app.use(express.json());

app.use(
session({
name: 'goliath_dashboard_session',
secret: process.env.SESSION_SECRET || 'dev-secret',
resave: false,
saveUninitialized: false,
proxy: true,
cookie: {
httpOnly: true,
secure: isProduction,
sameSite: isProduction ? 'none' : 'lax',
},
}),
);

app.use('/api/auth', authRoutes);
app.use('/api/discord', discordRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/owner', ownerRoutes);

app.use('/api/config', generalSettingsRoutes);
app.use('/api/config/automod', automodRoutes);
app.use('/api/config/logs', logsRoutes);
app.use('/api/config/messages', messagesRoutes);
app.use('/api/config/embeds', embedsRoutes);

app.use('/api/cases', moderationRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/forms', formsRoutes);
app.use('/api/translation', translationRoutes);
app.use('/api/modules', modulesRoutes);

app.use('/api/server-restore', serverRestoreRoutes);
app.use('/api/security', securityRoutes);

initSocketHub(apiServer, {
clientUrl: dashboardClientUrl,
});

const apiPort = Number(process.env.PORT || process.env.BOT_API_PORT || 3001);

apiServer.listen(apiPort, () => {
console.log(`🌐 Dashboard API running on http://localhost:${apiPort}`);
});

return apiServer;
}

/* ---------------- COMMANDS ---------------- */

function loadCommands() {
const commandsPath = path.join(process.cwd(), 'src', 'commands');
const files = getAllJsFiles(commandsPath);

console.log(`📦 Loading commands from: ${commandsPath}`);

for (const file of files) {
try {
delete require.cache[require.resolve(file)];

  const command = require(file);

  if (!command?.data?.name || typeof command.execute !== 'function') {
    console.warn(`⚠️ Skipped command: ${file}`);
    continue;
  }

  client.commands.set(command.data.name, command);
  console.log(`✅ Command: ${command.data.name}`);
} catch (error) {
  console.error(`❌ Command failed: ${file}`);
  console.error(error);
}
}

console.log(`✅ Loaded ${client.commands.size} command(s).`);
}

/* ---------------- EVENTS ---------------- */
const registeredEvents = new Set();

function registerEvent(event, file) {
if (!event?.name || typeof event.execute !== 'function') {
console.warn(`⚠️ Skipped event in: ${file}`);
return;
}

const eventKey = `${event.name}:${file}`;

if (registeredEvents.has(eventKey)) {
console.warn(`⚠️ Duplicate event skipped: ${event.name} (${file})`);
return;
}

registeredEvents.add(eventKey);

if (event.name === 'interactionCreate') {
const existing = client.listenerCount('interactionCreate');

if (existing > 0) {
  console.warn(`⚠️ Removing ${existing} existing interactionCreate listener(s)`);
  client.removeAllListeners('interactionCreate');
}
}

const handler = async (...args) => {
try {
await event.execute(...args, client);
} catch (error) {
console.error(`❌ Event execution failed: ${event.name}`);
console.error(error);
}
};

if (event.once) {
client.once(event.name, handler);
} else {
client.on(event.name, handler);
}

console.log(`🧩 Event: ${event.name}`);
}

function registerEventExport(eventExport, file) {
const events = Array.isArray(eventExport) ? eventExport : [eventExport];

if (!events.length) {
console.warn(`⚠️ Skipped empty event export in: ${file}`);
return;
}

for (const event of events) {
registerEvent(event, file);
}
}

function loadEvents() {
const eventsPath = path.join(process.cwd(), 'src', 'events');
const files = getAllJsFiles(eventsPath);

console.log(`📦 Loading events from: ${eventsPath}`);

for (const file of files) {
try {
delete require.cache[require.resolve(file)];
const event = require(file);
registerEventExport(event, file);
} catch (error) {
console.error(`❌ Event failed: ${file}`);
console.error(error);
}
}

console.log('✅ Event loading complete.');
console.log(`[Debug] interactionCreate listeners: ${client.listenerCount('interactionCreate')}`);
}

/* ---------------- PROCESS SAFETY ---------------- */

process.on('unhandledRejection', (reason) => {
console.error('❌ Unhandled Rejection');
console.error(reason);
});

process.on('uncaughtException', (error) => {
console.error('❌ Uncaught Exception');
console.error(error);
});

process.on('SIGINT', async () => {
console.log('🛑 SIGINT received. Shutting down Goliath...');
if (client?.destroy) client.destroy();
process.exit(0);
});

/* ---------------- START ---------------- */

async function start() {
printStartupBanner();

bootstrapRuntime(BOT_MODE);
printStartupFingerprint(BOT_MODE);
runBootValidation();

if (startServerBackupScheduler) {
try {
startServerBackupScheduler({ intervalDays: 7, maxBackups: 3 });
} catch (error) {
console.error('❌ Failed to start server backup scheduler');
console.error(error);
}
}

loadCommands();
loadEvents();

const apiServer = startDashboardApiServer();
client.dashboardApiServer = apiServer;

const token = getRequiredEnv('DISCORD_TOKEN');
await client.login(token);
}

start();
