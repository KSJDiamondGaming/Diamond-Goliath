const { reloadGuild, syncGuildMeta } = require('./guildManager');

function setupGuildSync(client) {
  console.log('🔄 Guild sync ready');

  if (!client) {
    return;
  }

  client.on('guildCreate', (guild) => {
    try {
      syncGuildMeta(guild);
      reloadGuild(guild.id);
      console.log(`✅ Synced new guild: ${guild.name} (${guild.id})`);
    } catch (error) {
      console.error('❌ Failed to sync new guild:', error);
    }
  });

  client.on('guildUpdate', (_, newGuild) => {
    try {
      syncGuildMeta(newGuild);
      reloadGuild(newGuild.id);
      console.log(`🔄 Synced guild update: ${newGuild.name} (${newGuild.id})`);
    } catch (error) {
      console.error('❌ Failed to sync updated guild:', error);
    }
  });

  client.on('guildDelete', (guild) => {
    try {
      reloadGuild(guild.id);
      console.log(`⚠️ Guild removed or unavailable: ${guild.name} (${guild.id})`);
    } catch (error) {
      console.error('❌ Failed to handle guild delete:', error);
    }
  });
}

module.exports = {
  setupGuildSync,
};