'use strict';

const guildManager = require('../../core/guild/guildManager');
const { handleAuditLogEntry } = require('../../core/security/protection/advancedThreatProtection');

module.exports = {
  name: 'guildAuditLogEntryCreate',

  async execute(auditLogEntry, guild) {
    try {
      if (!guild?.id) return;
      if (!guildManager.isModuleEnabled(guild.id, 'security')) return;
      await handleAuditLogEntry(auditLogEntry, guild);
    } catch (error) {
      console.error('[SecurityAuditStream] Failed to process audit event:', error);
    }
  },
};
