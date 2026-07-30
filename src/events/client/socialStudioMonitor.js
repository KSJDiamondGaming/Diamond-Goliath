'use strict';

const { startupSocialStudio, checkGuildAccounts } = require('../../modules/socialStudio/socialStudioMonitor');

const PLATFORM_LABELS = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  kick: 'Kick',
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X',
};

function formatProviderResult(item) {
  const platform = PLATFORM_LABELS[item.platform] || item.platform || 'Unknown';
  let state = '🟡 UNAVAILABLE';

  if (item.status === 'live' || item.isLive === true) state = '🔴 LIVE';
  else if (item.status === 'offline' || item.isLive === false) state = '⚫ OFFLINE';
  else if (item.status === 'configuration_required') state = '🟠 CONFIG REQUIRED';
  else if (item.status === 'unsupported') state = '⚪ UNSUPPORTED';
  else if (item.status === 'ok') state = '🟢 OK';
  else if (item.status) state = `🟡 ${String(item.status).replace(/_/g, ' ').toUpperCase()}`;

  const identity = item.username || item.externalId || 'Unknown account';
  const extra = [];
  if (item.externalId) extra.push(`ID: ${item.externalId}`);
  if (item.events?.length) extra.push(`Detected: ${item.events.map((event) => event.type).join(', ')}`);
  if (item.delivered?.length) extra.push(`Posted: ${item.delivered.map((event) => event.type).join(', ')}`);
  if (item.reason) extra.push(item.reason);

  return `**${platform}** — **${state}** — ${identity}${extra.length ? `\n↳ ${extra.join(' • ')}` : ''}`;
}

function checkOptions(customId) {
  if (customId === 'social:account:check') return { manual: true, force: true };
  if (customId.startsWith('social:account:check:')) {
    return { manual: true, force: true, accountIds: [customId.slice('social:account:check:'.length)] };
  }
  if (customId.startsWith('social:creator:check:')) {
    return { manual: true, force: true, creatorIds: [customId.slice('social:creator:check:'.length)] };
  }
  return null;
}

module.exports = [
  {
    name: 'clientReady',
    once: true,
    async execute(client) {
      startupSocialStudio(client);
    },
  },
  {
    name: 'interactionCreate',
    once: false,
    async execute(interaction, client) {
      const customId = String(interaction?.customId || '');
      const options = checkOptions(customId);
      if (!options || !interaction.guildId) return;

      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
      const outcome = await checkGuildAccounts(client || interaction.client, interaction.guildId, options);
      let summary;

      if (outcome.skipped && outcome.reason === 'check_already_running') {
        summary = '⏳ A Social Studio check is already running for this server.';
      } else {
        const lines = (outcome.results || []).map(formatProviderResult);
        summary = lines.length ? lines.join('\n').slice(0, 1900) : 'No matching enabled Social Studio accounts were available to check.';
      }

      await interaction.followUp({ content: `🔎 **Social Studio Status Check**\n\n${summary}`, flags: 64 }).catch(() => null);
    },
  },
];
