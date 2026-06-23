function getEnvList(name) {
  const value = process.env[name];

  if (!value) return [];

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAllowedGuildIds(botMode) {
  if (botMode === 'DEV') {
    return getEnvList('DEV_GUILD_ID');
  }

  if (botMode === 'BETA') {
    return getEnvList('BETA_GUILD_IDS');
  }

  return [];
}

function isGuildAllowed(guildId, botMode, modeConfig) {
  if (!modeConfig.strictGuildAccess) {
    return true;
  }

  const allowedGuildIds = getAllowedGuildIds(botMode);

  if (!allowedGuildIds.length) {
    return true;
  }

  return allowedGuildIds.includes(guildId);
}

async function enforceGuildAccess(guild, botMode, modeConfig) {
if (!guild) return false;

if (!modeConfig.strictGuildAccess) {
return true;
}

const allowedGuildIds = getAllowedGuildIds(botMode);

console.log('====================================');
console.log('[Guild Access Debug]');
console.log('Bot Mode:', botMode);
console.log('Guild Name:', guild.name);
console.log('Guild ID:', guild.id);
console.log('Allowed Guild IDs:', allowedGuildIds);
console.log('====================================');

if (!allowedGuildIds.length) {
console.warn(
`⚠️ ${botMode} mode has strict guild access enabled, but no allowed guild IDs are configured.`
);
return true;
}

if (allowedGuildIds.includes(guild.id)) {
console.log(`✅ Authorized guild: ${guild.name} (${guild.id})`);
return true;
}

console.warn(
`🚫 ${botMode} bot was added to unauthorized guild: ${guild.name} (${guild.id})`
);

try {
await guild.leave();
console.warn(`👋 Left unauthorized guild: ${guild.name} (${guild.id})`);
} catch (err) {
console.error(
`❌ Failed to leave unauthorized guild: ${guild.name} (${guild.id})`
);
console.error(err);
}

return false;
}


async function enforceCurrentGuilds(client, botMode, modeConfig) {
  if (!client?.guilds?.cache) return;

  if (!modeConfig.strictGuildAccess) {
    return;
  }

  for (const guild of client.guilds.cache.values()) {
    await enforceGuildAccess(guild, botMode, modeConfig);
  }
}

module.exports = {
  getAllowedGuildIds,
  isGuildAllowed,
  enforceGuildAccess,
  enforceCurrentGuilds,
};
