const {
  getPunishments,
  removePunishment,
} = require('../logging/modlogs/tempPunishmentsStore')

function startPunishmentScheduler(client) {
  console.log('⏱️ Temp punishment scheduler started');

  const run = async () => {
    const punishments = getPunishments();
    const now = Date.now();

    for (const punishment of punishments) {
      if (Number(punishment.expiresAt) > now) continue;

      try {
        const guild = await client.guilds.fetch(punishment.guildId).catch(() => null);

        if (!guild) {
          removePunishment(punishment.id);
          continue;
        }

        if (punishment.type === 'mute') {
          const member = await guild.members.fetch(punishment.userId).catch(() => null);

          if (member) {
            await member.timeout(null, 'Temporary mute expired').catch(() => null);
          }
        }

        if (punishment.type === 'ban') {
          await guild.members.unban(punishment.userId, 'Temporary ban expired').catch(() => null);
        }

        removePunishment(punishment.id);

        console.log(
          `✅ Expired temp ${punishment.type} removed for ${punishment.userId} in guild ${punishment.guildId}`
        );
      } catch (error) {
        console.error('Temp punishment scheduler error:', error);
      }
    }
  };

  run().catch((error) => {
    console.error('Initial temp punishment scheduler run failed:', error);
  });

  setInterval(() => {
    run().catch((error) => {
      console.error('Temp punishment scheduler interval failed:', error);
    });
  }, 30_000);
}

module.exports = startPunishmentScheduler;