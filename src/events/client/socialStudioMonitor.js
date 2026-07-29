'use strict';

const { startupSocialStudio, checkGuildAccounts } = require('../../modules/socialStudio/socialStudioMonitor');

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
      const lines = (outcome.results || []).map((item) => {
        const state = item.status === 'live' ? '🔴 LIVE' : item.status === 'offline' || item.status === 'ok' ? '🟢 Checked' : `⚠️ ${item.status}`;
        return `${state} • ${item.platform} • ${item.username}${item.reason ? ` — ${item.reason}` : ''}`;
      });
      const summary = lines.length ? lines.join('\n').slice(0, 1900) : 'No enabled Social Studio accounts were available to check.';
      await interaction.followUp({ content: `🔎 **Social Studio provider check**\n${summary}`, flags: 64 }).catch(() => null);
    },
  },
];
