// functions/moderation/punishmentScheduler.js

const {
  getPunishments,
  removePunishment,
} = require('../logging/modlogs/tempPunishmentsStore');

const INTERVAL_MS = 30_000;

let schedulerStarted = false;

function startPunishmentScheduler(client) {
  if (schedulerStarted) {
    console.warn('⚠️ Temp punishment scheduler already running');
    return;
  }

  schedulerStarted = true;
  console.log('⏱️ Temp punishment scheduler started');

  async function run() {
    const punishments = getPunishments();
    const now = Date.now();

    for (const punishment of punishments) {
      if (!punishment?.expiresAt) continue;
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
          await guild.members
            .unban(punishment.userId, 'Temporary ban expired')
            .catch(() => null);
        }

        removePunishment(punishment.id);

        console.log(
          `✅ Expired ${punishment.type} removed | user=${punishment.userId} guild=${punishment.guildId}`
        );
      } catch (error) {
        console.error(
          `❌ Scheduler error (user=${punishment.userId}, guild=${punishment.guildId}):`,
          error
        );
      }
    }
  }

  // Initial run
  run().catch((err) => {
    console.error('❌ Initial scheduler run failed:', err);
  });

  // Interval loop
  setInterval(() => {
    run().catch((err) => {
      console.error('❌ Scheduler interval failed:', err);
    });
  }, INTERVAL_MS);
}

module.exports = startPunishmentScheduler;