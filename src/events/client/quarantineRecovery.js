'use strict';

const { Events } = require('discord.js');
const {
  getQuarantineState,
  recoverQuarantines,
  recoverGuildQuarantine,
  syncQuarantineIsolation,
  enforceQuarantineOnMember,
  startQuarantineExpiryScheduler,
} = require('../../core/security/protection/quarantine');

function hasActiveQuarantine(guildId) {
  return Object.keys(getQuarantineState(guildId)?.users || {}).length > 0;
}

module.exports = [
  {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
      try {
        const result = await recoverQuarantines(client);
        console.log(`[QuarantineSystem] Startup recovery: ${result.guilds} guild(s), ${result.active} active, ${result.reapplied} re-applied, ${result.restored} restored, ${result.failed} failed.`);
      } catch (error) {
        console.error('[QuarantineSystem] Startup recovery failed:', error);
      }
      startQuarantineExpiryScheduler(client);
    },
  },
  {
    name: Events.ChannelCreate,
    async execute(channel) {
      if (!channel?.guild || !hasActiveQuarantine(channel.guild.id)) return;
      try {
        await syncQuarantineIsolation(channel.guild);
      } catch (error) {
        console.warn(`[QuarantineSystem] Failed to secure new channel ${channel.id}:`, error.message);
      }
    },
  },
  {
    name: Events.GuildMemberAdd,
    async execute(member) {
      if (!member?.guild || !getQuarantineState(member.guild.id)?.users?.[member.id]) return;
      try {
        const result = await enforceQuarantineOnMember(member);
        if (!result.success) console.warn(`[QuarantineSystem] Failed to reapply quarantine to ${member.id}: ${result.error || result.reason}`);
      } catch (error) {
        console.warn(`[QuarantineSystem] Failed join enforcement for ${member.id}:`, error.message);
      }
    },
  },
  {
    name: Events.GuildRoleDelete,
    async execute(role) {
      if (!role?.guild || !hasActiveQuarantine(role.guild.id)) return;
      const state = getQuarantineState(role.guild.id);
      if (String(state.roleId || '') !== String(role.id) && String(state.roleName || '') !== String(role.name || '')) return;
      try {
        const result = await recoverGuildQuarantine(role.guild);
        if (!result.success) console.warn(`[QuarantineSystem] Quarantine role recovery incomplete in ${role.guild.id}.`);
      } catch (error) {
        console.warn(`[QuarantineSystem] Failed to recover deleted quarantine role in ${role.guild.id}:`, error.message);
      }
    },
  },
];
