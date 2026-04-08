const { getPunishments, removePunishment } = require('./tempPunishmentsStore');
const logModerationAction = require('./logging/ModerationActionLog');

function startScheduler(client) {
  setInterval(async () => {
    const punishments = getPunishments();
    const now = Date.now();

    for (const punishment of punishments) {
      if (now < punishment.expiresAt) continue;

      try {
        const guild = await client.guilds.fetch(punishment.guildId);
        if (!guild) continue;

        if (punishment.type === 'mute') {
          const member = await guild.members.fetch(punishment.userId);

          await member.timeout(null);

          await logModerationAction({
            guild,
            action: 'Automatic Unmute',
            user: member.user,
            moderator: null,
            reason: 'Temporary mute expired',
            color: '#2ecc71'
          });
        }

        if (punishment.type === 'ban') {
          const bannedUser = await client.users.fetch(punishment.userId);

          await guild.members.unban(punishment.userId);

          await logModerationAction({
            guild,
            action: 'Automatic Unban',
            user: bannedUser,
            moderator: null,
            reason: 'Temporary ban expired',
            color: '#2ecc71'
          });
        }

        removePunishment(
          punishment.userId,
          punishment.guildId,
          punishment.type
        );
      } catch (error) {
        console.error('Punishment scheduler error:', error);
      }
    }
  }, 30 * 1000);
}

module.exports = { startScheduler };