require('dotenv').config();

const { REST, Routes } = require('discord.js');

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) {
  throw new Error('Missing TOKEN in .env');
}

if (!clientId) {
  throw new Error('Missing CLIENT_ID in .env');
}

async function clearCommands() {
  const rest = new REST({ version: '10' }).setToken(token);

  console.log('🧹 Clearing global commands...');
  await rest.put(
    Routes.applicationCommands(clientId),
    { body: [] }
  );
  console.log('✅ Cleared global commands.');

  if (guildId) {
    console.log(`🧹 Clearing guild commands for guild ${guildId}...`);
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: [] }
    );
    console.log('✅ Cleared guild commands.');
  } else {
    console.log('ℹ️ No GUILD_ID found, skipped guild command clearing.');
  }
}

clearCommands().catch((error) => {
  console.error('❌ Failed to clear commands:', error);
  process.exit(1);
});