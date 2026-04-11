const {
  getPunishments,
  removePunishment,
} = require('./tempPunishmentsStore');

async function processPunishment(client, punishment) {
  const { userId, guildId, type, expiresAt } = punishment;

  if (!userId || !guildId || !type || !expiresAt) {
    removePunishment(userId, guildId, type);
    return;
  }

  if (Date.now() < expiresAt) {
    return;
  }

  const guild = client.guilds.cache.get(guildId);

  if (!guild) {
    removePunishment(userId, guildId, type);
    return;
  }

  try {
    if (type === 'ban') {
      await guild.members.unban(userId).catch(() => null);
      console.log(`✅ Temp ban expired for ${userId} in guild ${guildId}`);
    }

    if (type === 'mute') {
      const member = await guild.members.fetch(userId).catch(() => null);

      if (member) {
        await member.timeout(null, 'Temporary mute expired').catch(() => null);
        console.log(`✅ Temp mute expired for ${userId} in guild ${guildId}`);
      }
    }
  } finally {
    removePunishment(userId, guildId, type);
  }
}

async function processExpiredPunishments(client) {
  const punishments = getPunishments();

  for (const punishment of punishments) {
    await processPunishment(client, punishment);
  }
}

function startTempPunishmentsRunner(client) {
  client.once('ready', async () => {
    console.log('⏳ Temp punishments runner started');

    await processExpiredPunishments(client);

    setInterval(async () => {
      await processExpiredPunishments(client);
    }, 30 * 1000);
  });
}

module.exports = startTempPunishmentsRunner;