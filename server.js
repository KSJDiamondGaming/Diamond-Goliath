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
const ownerDiagnosticsRoutes = require('./src/server/routes/ownerDiagnostics');
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
const pollsRoutes = require('./src/server/routes/polls');
const statsRoutes = require('./src/server/routes/stats');
const tempVoiceRoutes = require('./src/server/routes/tempVoice');
const starboardRoutes = require('./src/server/routes/starboard');

const deploymentRoutes = require('./src/server/routes/deployments');
const ownerDeploymentRoutes = require('./src/server/routes/ownerDeployments');

const discordResourceRoutes = require('./src/server/routes/discordResources');
const ownerEmbedRoutes = require('./src/server/routes/ownerEmbeds');
const ownerTicketRoutes = require('./src/server/routes/ownerTickets');
const ownerOperationsRoutes = require('./src/server/routes/ownerOperations');
const ownerPermissionsRoutes = require('./src/server/routes/ownerPermissions');
const ownerSecurityRoutes = require('./src/server/routes/ownerSecurity');
const ownerSubscriptionRoutes = require('./src/server/routes/ownerSubscription');

const interactionCreate = require('./src/events/interactions/interactionCreate');
const messageCreate = require('./src/events/messages/messageCreate');
const memberJoinLeave = require('./src/events/members/memberJoinLeave');
const inviteLogs = require('./src/events/invites/inviteLogs');
const channelLogs = require('./src/events/channels/channelLogs');
const roleLogs = require('./src/events/roles/roleLogs');
const emojiLogs = require('./src/events/emojis/emojiLogs');
const webhookLogs = require('./src/events/webhooks/webhookLogs');
const threadLogs = require('./src/events/threads/threadLogs');
const messageLogs = require('./src/events/messages/messageLogs');
const voiceStateUpdate = require('./src/events/voice/voiceStateUpdate');
const guildLogs = require('./src/events/guild/guildLogs');

const commandHandler = require('./src/handlers/commandHandler');

const { startBackupScheduler } = require('./src/core/backup/backupScheduler');
const { initializeDefaultModules } = require('./src/core/guild/defaultModules');
const { syncGuildMeta } = require('./src/core/guild/guildManager');
const { syncDiscordResources } = require('./src/core/guild/discordResourceManager');
const { getRuntimePaths } = require('./src/config/runtimePaths');

const config = getBotModeConfig();
const PORT = Number(process.env.PORT || 3001);
const SESSION_SECRET = process.env.SESSION_SECRET || 'goliath-dev-session-secret';

const runtimePaths = bootstrapRuntime(config);
printStartupFingerprint(config, runtimePaths);

runBootValidation({
requiredPaths: [
{ path: path.join(process.cwd(), 'src'), label: 'src root' },
{ path: path.join(process.cwd(), 'src', 'dashboard'), label: 'dashboard source' },
],
requiredEnv: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'],
});

const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMembers,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.GuildMessageReactions,
GatewayIntentBits.GuildInvites,
GatewayIntentBits.GuildVoiceStates,
GatewayIntentBits.MessageContent,
],
partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();

const app = express();
const server = http.createServer(app);
const io = initSocketHub(server);

app.set('goliath.client', client);
app.set('goliath.io', io);

app.use(cors({
origin: process.env.DASHBOARD_URL || 'http://localhost:5173',
credentials: true,
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
secret: SESSION_SECRET,
resave: false,
saveUninitialized: false,
cookie: {
secure: false,
httpOnly: true,
maxAge: 1000 * 60 * 60 * 24 * 7,
},
}));

app.use((req, res, next) => {
req.client = client;
req.io = io;
next();
});

app.use('/api/auth', authRoutes);
app.use('/api/discord', discordRoutes);
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

client.once('ready', async () => {
console.log(`✅ Logged in as ${client.user.tag}`);

for (const guild of client.guilds.cache.values()) {
try {
enforceGuildAccess(guild.id);
initializeDefaultModules(guild.id);
syncGuildMeta(guild);
await syncDiscordResources(guild);
} catch (error) {
console.error(`❌ Guild startup sync failed for ${guild.id}`, error);
}
}

startBackupScheduler(client);
});

client.on('interactionCreate', (...args) => interactionCreate.execute(...args));
client.on('messageCreate', (...args) => messageCreate.execute(...args));
client.on('guildMemberAdd', (...args) => memberJoinLeave.guildMemberAdd(...args));
client.on('guildMemberRemove', (...args) => memberJoinLeave.guildMemberRemove(...args));
client.on('inviteCreate', (...args) => inviteLogs.inviteCreate(...args));
client.on('inviteDelete', (...args) => inviteLogs.inviteDelete(...args));
client.on('channelCreate', (...args) => channelLogs.channelCreate(...args));
client.on('channelDelete', (...args) => channelLogs.channelDelete(...args));
client.on('channelUpdate', (...args) => channelLogs.channelUpdate(...args));
client.on('roleCreate', (...args) => roleLogs.roleCreate(...args));
client.on('roleDelete', (...args) => roleLogs.roleDelete(...args));
client.on('roleUpdate', (...args) => roleLogs.roleUpdate(...args));
client.on('emojiCreate', (...args) => emojiLogs.emojiCreate(...args));
client.on('emojiDelete', (...args) => emojiLogs.emojiDelete(...args));
client.on('emojiUpdate', (...args) => emojiLogs.emojiUpdate(...args));
client.on('webhookUpdate', (...args) => webhookLogs.webhookUpdate(...args));
client.on('threadCreate', (...args) => threadLogs.threadCreate(...args));
client.on('threadDelete', (...args) => threadLogs.threadDelete(...args));
client.on('threadUpdate', (...args) => threadLogs.threadUpdate(...args));
client.on('messageDelete', (...args) => messageLogs.messageDelete(...args));
client.on('messageUpdate', (...args) => messageLogs.messageUpdate(...args));
client.on('voiceStateUpdate', (...args) => voiceStateUpdate.execute(...args));
client.on('guildCreate', (guild) => {
try {
enforceGuildAccess(guild.id);
initializeDefaultModules(guild.id);
syncGuildMeta(guild);
syncDiscordResources(guild).catch((error) => console.error(`❌ Guild resource sync failed for ${guild.id}`, error));
} catch (error) {
console.error(`❌ Guild create rejected for ${guild.id}`, error);
guild.leave().catch(() => null);
}
});

client.login(config.token);
server.listen(PORT, () => {
console.log(`🚀 Goliath dashboard/server listening on port ${PORT}`);
});
