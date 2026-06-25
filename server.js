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
} = require('./src/core/runtime/runtimeBootstrap');

const { initSocketHub } = require('./src/server/sockets/socketHub');

const authRoutes = require('./src/server/routes/auth');
const discordResourceRoutes = require('./src/server/routes/discordResources');
const discordRoutes = require('./src/server/routes/discord');
const statusRoutes = require('./src/server/routes/status');
const ownerRoutes = require('./src/server/routes/owner');
const ownerTranslationRoutes = require('./src/server/routes/ownerTranslation');

const automodRoutes = require('./src/server/routes/config/automod');
const generalSettingsRoutes = require('./src/server/routes/config/generalSettings');
const logsRoutes = require('./src/server/routes/config/logs');
const messagesRoutes = require('./src/server/routes/config/messages');
const embedsRoutes = require('./src/server/routes/config/embeds');

const billingRoutes = require('./src/server/routes/billing');
const moderationRoutes = require('./src/server/routes/moderation');
const serverRestoreRoutes = require('./src/server/routes/serverRestoreRoutes');
const securityRoutes = require('./src/server/routes/security');
const ticketRoutes = require('./src/server/routes/tickets');
const formsRoutes = require('./src/server/routes/forms');
const transcriptRoutes = require('./src/server/routes/transcripts');
const translationRoutes = require('./src/server/routes/translation');
const permissionHealthRoutes = require('./src/server/routes/permissionHealth');
const socialRoutes = require('./src/server/routes/social');
const modulesRoutes = require('./src/server/routes/modules');

/* ---------------- SAFE MODULE LOADS ---------------- */

const backupSchedulerModule = safeLoad(
'Server Backup Scheduler',
() => require('./src/core/security/serverBackupScheduler'),
);

const startServerBackupScheduler =
backupSchedulerModule.ok &&
typeof backupSchedulerModule.result?.startServerBackupScheduler === 'function'
? backupSchedulerModule.result.startServerBackupScheduler
: null;

const socialSchedulerModule = safeLoad(
'Social Scheduler',
() => require('./src/modules/social/socialScheduler'),
);

const startSocialScheduler =
socialSchedulerModule.ok &&
typeof socialSchedulerModule.result?.startSocialScheduler === 'function'
? socialSchedulerModule.result.startSocialScheduler
: null;

const subscriptionWorkerModule = safeLoad(
'Subscription Worker',
() => require('./src/server/billing/subscriptionWorker'),
);

const startSubscriptionWorker =
subscriptionWorkerModule.ok &&
typeof subscriptionWorkerModule.result?.startSubscriptionWorker === 'function'
? subscriptionWorkerModule.result.startSubscriptionWorker
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
GatewayIntentBits.GuildVoiceStates,
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
console.log('================================================------------');
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
process.env.DASHBOARD_CLIENT_URL ||
process.env.CLIENT_URL ||
'http://localhost:5173',
).replace(/\/$/, '');
}

function startDashboardApiServer() {
const app = express();
const apiServer = http.createServer(app);
const dashboardClientUrl = getDashboardClientUrl();

app.set('trust proxy', 1);
app.set('goliath.client', client);

const allowedOrigins = getAllowedOrigins();

app.use(
cors({
origin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`CORS blocked origin: ${origin}`));
},
credentials: true,
}),
);

app.use(express.json({ limit: '1mb' }));

app.use(
session({
secret: process.env.SESSION_SECRET || process.env.DASHBOARD_SESSION_SECRET || 'goliath-dev-session',
resave: false,
saveUninitialized: false,
cookie: {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  maxAge: 1000 * 60 * 60 * 24 * 7,
},
}),
);

app.use((req, res, next) => {
req.client = client;
req.io = req.app.get('io');
next();
});

app.use('/auth', authRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/owner/translation', ownerTranslationRoutes);
app.use('/api/discord', discordResourceRoutes);
app.use('/api/discord', discordRoutes);
app.use('/api/config/automod', automodRoutes);
app.use('/api/config/general', generalSettingsRoutes);
app.use('/api/config/logs', logsRoutes);
app.use('/api/config/messages', messagesRoutes);
app.use('/api/config/embeds', embedsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/restore', serverRestoreRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/forms', formsRoutes);
app.use('/api/transcripts', transcriptRoutes);
app.use('/api/translation', translationRoutes);
app.use('/api/permissions', permissionHealthRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/modules', modulesRoutes);

app.use(express.static(path.join(process.cwd(), 'dist')));

app.get('*', (req, res) => {
res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

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
  console.warn(
    `⚠️ interactionCreate already has ${existing} listener(s); registering additional handler from ${file}`,
  );
}
}

client.on(event.name, async (...args) => {
try {
await event.execute(...args);
} catch (error) {
console.error(`❌ Event error: ${event.name}`);
console.error(error);
}
});
}

async function start() {
printStartupBanner();

bootstrapRuntime({ mode: selectedMode });
printStartupFingerprint({ mode: BOT_MODE });

runBootValidation({
mode: selectedMode,
});

getRequiredEnv('DISCORD_BOT_TOKEN');
getRequiredEnv('DISCORD_CLIENT_ID');

loadCommands();

const eventsPath = path.join(process.cwd(), 'src', 'events');

for (const file of getAllJsFiles(eventsPath)) {
try {
const loadedEvent = require(file);
const events = Array.isArray(loadedEvent) ? loadedEvent : [loadedEvent];

for (const event of events) {
  registerEvent(event, file);
}
} catch (error) {
console.error(`❌ Event failed: ${file}`);
console.error(error);
}
}

startDashboardApiServer();

if (startServerBackupScheduler) {
try {
startServerBackupScheduler(client);
} catch (error) {
console.error('⚠️ Failed to start Server Backup Scheduler:', error);
}
}

if (startSocialScheduler) {
try {
startSocialScheduler(client);
} catch (error) {
console.error('⚠️ Failed to start Social Scheduler:', error);
}
}

if (startSubscriptionWorker) {
try {
startSubscriptionWorker(client);
} catch (error) {
console.error('⚠️ Failed to start Subscription Worker:', error);
}
}

await client.login(process.env.DISCORD_BOT_TOKEN);
}

start().catch((error) => {
console.error('❌ Fatal startup error:', error);
process.exit(1);
});
