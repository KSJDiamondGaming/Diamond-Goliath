'use strict';

const { Events } = require('discord.js');
const { canUseModAction } = require('../../core/administration/mod/permissions');
const decisioning = require('../../core/administration/mod/memberDecisioning');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const id = String(interaction?.customId || '');
    if (!id.startsWith('joinintel:')) return;
    if (!interaction.inGuild?.() || !interaction.isButton?.()) return;

    const [, action, guildId, userId] = id.split(':');
    if (String(interaction.guild.id) !== String(guildId) || !userId) {
      await interaction.reply({ content: '❌ That intelligence action is no longer valid.', flags: 64 }).catch(() => null);
      return;
    }

    const allowed = canUseModAction(interaction.member, interaction.guild, 'scan_run', interaction)
      || canUseModAction(interaction.member, interaction.guild, 'view_case_detail', interaction);
    if (!allowed) {
      await interaction.reply({ content: '❌ You do not have permission to manage Member Intelligence.', flags: 64 }).catch(() => null);
      return;
    }

    if (action === 'clear') {
      const target = interaction.guild.members.cache.get(userId)
        || await interaction.guild.members.fetch(userId).catch(() => null);
      const result = decisioning.markClear(interaction.guild.id, userId, interaction.user.id);
      await interaction.reply({
        content: `✅ ${target ? target.user : `<@${userId}>`} has been reviewed and marked **CLEAR** in Goliath Member Intelligence. This does not erase moderation history or watchlist evidence.`,
        flags: 64,
      }).catch(() => null);
      console.log(`[Join Intelligence] ${interaction.user.id} marked ${userId} clear in ${interaction.guild.id} (previous=${result.before?.decision || 'none'}).`);
    }
  },
};
