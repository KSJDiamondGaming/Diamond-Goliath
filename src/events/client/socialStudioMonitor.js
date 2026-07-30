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

  return `**${platform}** — **${state}** — ${item.username}${item.reason ? `\n↳ ${item.reason}` : ''}`;
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
      if (String(interaction?.customId || '') !== 'social:account:check') return;
      if (!interaction.guildId) return;
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
      const outcome = await checkGuildAccounts(client || interaction.client, interaction.guildId, { manual: true, force: true });
      const lines = (outcome.results || []).map(formatProviderResult);
      const summary = lines.length ? lines.join('\n').slice(0, 1900) : 'No enabled Social Studio accounts were available to check.';
      await interaction.followUp({ content: `🔎 **Social Studio Account Status Check**\n\n${summary}`, flags: 64 }).catch(() => null);
    },
  },
];
