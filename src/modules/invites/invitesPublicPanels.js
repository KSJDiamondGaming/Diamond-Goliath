'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const invites = require('./invites');

const refreshTimers = new Map();
const DEFAULT_PUBLIC = {
  channelId: null,
  messageId: null,
  inviteCode: null,
  title: '💎 Help Grow the Community',
  description: 'Share our official invite link with your friends and help grow the community.\n\nWant to climb the leaderboard? Create your own Discord invite and every valid join will count towards your total.',
  color: '#5865F2',
  footer: 'Invite friends • Grow the community • Climb the leaderboard',
  buttonLabel: 'Join Server',
  showMemberHelp: true,
};
const DEFAULT_LEADERBOARD = {
  channelId: null,
  messageId: null,
  title: '🏆 Community Invite Leaderboard',
  description: 'Invite friends and climb the rankings.',
  color: '#5865F2',
  footer: 'Updated automatically by Goliath',
  limit: 10,
};

function cleanText(value, max) { return String(value ?? '').trim().slice(0, max); }
function cleanColor(value, fallback = '#5865F2') { const colour = cleanText(value, 7); return /^#[0-9a-f]{6}$/i.test(colour) ? colour : fallback; }
function panelConfig(guildId) {
  const settings = invites.getSection(guildId).settings || {};
  return {
    publicPanel: { ...DEFAULT_PUBLIC, ...(settings.publicPanel || {}) },
    leaderboardPanel: { ...DEFAULT_LEADERBOARD, ...(settings.leaderboardPanel || {}) },
  };
}
function savePanelConfig(guildId, key, patch, meta = {}) {
  const current = panelConfig(guildId)[key];
  const next = { ...current, ...patch };
  invites.updateSettings(guildId, { [key]: next }, meta);
  return next;
}
function row(...components) { return new ActionRowBuilder().addComponents(...components); }
function officialUrl(code) { return code ? `https://discord.gg/${code}` : null; }

function buildPublicPayload(guildId) {
  const { publicPanel } = panelConfig(guildId);
  const url = officialUrl(publicPanel.inviteCode);
  if (!url) throw new Error('Select a permanent Invite Studio link before deploying the public panel.');
  const embed = new EmbedBuilder()
    .setColor(cleanColor(publicPanel.color))
    .setTitle(cleanText(publicPanel.title, 256) || DEFAULT_PUBLIC.title)
    .setDescription(cleanText(publicPanel.description, 4000) || DEFAULT_PUBLIC.description)
    .setFooter({ text: cleanText(publicPanel.footer, 2048) || DEFAULT_PUBLIC.footer })
    .setTimestamp();
  const buttons = [new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(cleanText(publicPanel.buttonLabel, 80) || 'Join Server')];
  if (publicPanel.showMemberHelp !== false) buttons.push(new ButtonBuilder().setCustomId('invites:member-help').setStyle(ButtonStyle.Secondary).setLabel('Create My Invite'));
  return { embeds: [embed], components: [row(...buttons)] };
}

function leaderboardLines(guildId, limit) {
  const entries = invites.leaderboard(guildId, limit);
  if (!entries.length) return 'No valid invites have been recorded yet.';
  const medals = ['🥇', '🥈', '🥉'];
  return entries.map((entry, index) => `${medals[index] || `**${index + 1}.**`} <@${entry.inviterId}> — **${entry.score}** valid invite${entry.score === 1 ? '' : 's'}`).join('\n');
}
function buildLeaderboardPayload(guildId) {
  const { leaderboardPanel } = panelConfig(guildId);
  const limit = Math.max(3, Math.min(25, Number(leaderboardPanel.limit || 10)));
  const embed = new EmbedBuilder()
    .setColor(cleanColor(leaderboardPanel.color))
    .setTitle(cleanText(leaderboardPanel.title, 256) || DEFAULT_LEADERBOARD.title)
    .setDescription(`${cleanText(leaderboardPanel.description, 1200) || DEFAULT_LEADERBOARD.description}\n\n${leaderboardLines(guildId, limit)}`)
    .setFooter({ text: cleanText(leaderboardPanel.footer, 2048) || DEFAULT_LEADERBOARD.footer })
    .setTimestamp();
  return { embeds: [embed], components: [] };
}

async function resolveChannel(guild, channelId) {
  const channel = channelId ? (guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null)) : null;
  if (!channel?.send) throw new Error('Select a text channel where Goliath can post this panel.');
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const permissions = channel.permissionsFor(me);
  if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.EmbedLinks)) {
    throw new Error(`Goliath needs View Channel, Send Messages and Embed Links in ${channel}.`);
  }
  return channel;
}
async function upsertMessage(guild, configKey, payload, meta = {}) {
  const config = panelConfig(guild.id)[configKey];
  const channel = await resolveChannel(guild, config.channelId);
  let message = config.messageId ? await channel.messages.fetch(config.messageId).catch(() => null) : null;
  if (message) await message.edit(payload);
  else message = await channel.send(payload);
  savePanelConfig(guild.id, configKey, { channelId: channel.id, messageId: message.id }, meta);
  return message;
}
async function deployPublicPanel(guild, meta = {}) { return upsertMessage(guild, 'publicPanel', buildPublicPayload(guild.id), meta); }
async function deployLeaderboardPanel(guild, meta = {}) { return upsertMessage(guild, 'leaderboardPanel', buildLeaderboardPayload(guild.id), meta); }
async function refreshLeaderboard(guild) {
  const config = panelConfig(guild.id).leaderboardPanel;
  if (!config.channelId || !config.messageId) return false;
  const channel = guild.channels.cache.get(config.channelId) || await guild.channels.fetch(config.channelId).catch(() => null);
  const message = channel?.messages ? await channel.messages.fetch(config.messageId).catch(() => null) : null;
  if (!message) return false;
  await message.edit(buildLeaderboardPayload(guild.id));
  return true;
}
function queueLeaderboardRefresh(guild, delay = 3000) {
  clearTimeout(refreshTimers.get(guild.id));
  refreshTimers.set(guild.id, setTimeout(() => {
    refreshTimers.delete(guild.id);
    refreshLeaderboard(guild).catch((error) => console.error('[InviteStudio] Leaderboard refresh failed:', error));
  }, delay));
}

async function handleMemberHelp(interaction) {
  if (interaction.customId !== 'invites:member-help') return false;
  const content = [
    '🔗 **Create your personal invite**',
    '',
    'Open the server name → **Invite People** → create or copy your invite link.',
    'Goliath will detect joins through your Discord invite and add valid joins to the leaderboard.',
    '',
    'For accurate tracking, keep one main invite active and do not delete it while sharing it.',
  ].join('\n');
  await interaction.reply({ content, flags: 64 });
  return true;
}

module.exports = {
  DEFAULT_PUBLIC,
  DEFAULT_LEADERBOARD,
  panelConfig,
  savePanelConfig,
  buildPublicPayload,
  buildLeaderboardPayload,
  deployPublicPanel,
  deployLeaderboardPanel,
  refreshLeaderboard,
  queueLeaderboardRefresh,
  handleMemberHelp,
};