const { AuditLogEvent } = require('discord.js');

const securitySystem = require('../../security/securitySystem');

module.exports = {
  name: 'channelDelete',

  /**
   * @param {import('discord.js').GuildChannel} channel
   */
  async execute(channel) {
    try {
      if (!channel?.guild) return;

      if (typeof securitySystem.handleChannelDelete === 'function') {
        await securitySystem.handleChannelDelete(channel);
        return;
      }

      const executor =
        typeof securitySystem.fetchAuditExecutor === 'function'
          ? await securitySystem.fetchAuditExecutor(
              channel.guild,
              AuditLogEvent.ChannelDelete
            )
          : null;

      if (typeof securitySystem.logIncident === 'function') {
        await securitySystem.logIncident(channel.guild, {
          type: securitySystem.INCIDENT_TYPES?.CHANNEL_DELETE || 'channel_delete',
          severity: securitySystem.SEVERITY?.MEDIUM || 'medium',
          actorId: executor?.id || null,
          actorTag: executor?.tag || null,
          targetId: channel.id,
          targetName: channel.name || null,
          targetType: channel.type || 'channel',
          reason: 'Channel deleted.',
          actionTaken: 'Logged channel delete event.',
          metadata: {
            fallbackHook: true,
            actorIsBot: executor?.bot || false,
          },
        });
      }
    } catch (err) {
      console.error('[Event: channelDelete] Error:', err);
    }
  },
};
