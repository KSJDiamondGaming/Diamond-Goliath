const fs = require('node:fs');
const path = require('node:path');

const {
  REST,
  Routes,
} = require('discord.js');

const {
  loadEnvironment,
} = require('../../config/envLoader');

/* ---------------- ENV / MODE ---------------- */

const ALLOWED_MODES = [
  'dev',
  'beta',
  'production',
];

const ALLOWED_COMMAND_MODES = [
  'guild',
  'global',
];

function resolveBotMode() {
  const argMode =
    process.argv[2]?.toLowerCase();

  const envMode =
    process.env.BOT_MODE?.toLowerCase();

  if (ALLOWED_MODES.includes(argMode)) {
    return argMode;
  }

  if (ALLOWED_MODES.includes(envMode)) {
    return envMode;
  }

  return 'dev';
}

const selectedMode = resolveBotMode();

process.env.BOT_MODE = selectedMode;

const loadedEnv = loadEnvironment(selectedMode);

const BOT_MODE = selectedMode.toUpperCase();
const envFile = loadedEnv?.envFile || `.env.${selectedMode}`;

/* ---------------- ENV HELPERS ---------------- */

function firstEnv(names) {
  for (const name of names) {
    const value = process.env[name];

    if (value && String(value).trim()) {
      return String(value).trim();
    }
  }

  return '';
}

function required(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(
      `❌ Missing ${name} in ${envFile}`
    );
  }

  return String(value).trim();
}

function requiredAny(names, label = names[0]) {
  const value = firstEnv(names);

  if (!value) {
    throw new Error(
      `❌ Missing ${label} in ${envFile}`
    );
  }

  return value;
}

/* ---------------- ENV VALUES ---------------- */

const TOKEN = requiredAny(
  [
    'DISCORD_TOKEN',
    'DISCORD_BOT_TOKEN',
    'TOKEN',
  ],
  'DISCORD_TOKEN'
);

const CLIENT_ID = requiredAny(
  [
    'DISCORD_CLIENT_ID',
    'CLIENT_ID',
    'APPLICATION_ID',
  ],
  'DISCORD_CLIENT_ID'
);

const COMMAND_MODE = (() => {
  const envCommandMode =
    process.env.COMMAND_MODE?.toLowerCase();

  if (
    ALLOWED_COMMAND_MODES.includes(envCommandMode)
  ) {
    return envCommandMode;
  }

  return BOT_MODE === 'PRODUCTION'
    ? 'global'
    : 'guild';
})();

const GUILD_IDS =
  BOT_MODE === 'DEV'
    ? firstEnv([
        'DEV_GUILD_ID',
        'MAIN_GUILD_ID',
        'GUILD_ID',
      ])
    : BOT_MODE === 'BETA'
      ? firstEnv([
          'BETA_GUILD_IDS',
          'BETA_GUILD_ID',
          'MAIN_GUILD_ID',
          'GUILD_ID',
        ])
      : firstEnv([
          'PRODUCTION_GUILD_IDS',
          'PRODUCTION_GUILD_ID',
          'MAIN_GUILD_ID',
          'GUILD_ID',
        ]);

/* ---------------- VALIDATION ---------------- */

required('DISCORD_TOKEN', TOKEN);
required('DISCORD_CLIENT_ID', CLIENT_ID);

if (!ALLOWED_COMMAND_MODES.includes(COMMAND_MODE)) {
  throw new Error(
    `❌ Invalid COMMAND_MODE "${COMMAND_MODE}" in ${envFile}. Use "guild" or "global".`
  );
}

if (COMMAND_MODE === 'guild') {
  required(
    BOT_MODE === 'DEV'
      ? 'DEV_GUILD_ID or MAIN_GUILD_ID'
      : BOT_MODE === 'BETA'
        ? 'BETA_GUILD_IDS or MAIN_GUILD_ID'
        : 'PRODUCTION_GUILD_IDS or MAIN_GUILD_ID',
    GUILD_IDS
  );
}

/* ---------------- REST ---------------- */

const rest = new REST({
  version: '10',
}).setToken(TOKEN);

/* ---------------- HELPERS ---------------- */

function parseGuildIds(value) {
  return String(value || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^\d{16,20}$/.test(id));
}

function getDiscordErrorSummary(error) {
  const code = error?.code ? `Discord ${error.code}` : 'Error';
  const status = error?.status ? `HTTP ${error.status}` : '';
  const message = error?.rawError?.message || error?.message || String(error);
  return [code, status, message].filter(Boolean).join(' · ');
}

function getAllJsFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = [];

  for (
    const entry of fs.readdirSync(dir, {
      withFileTypes: true,
    })
  ) {
    const fullPath = path.join(
      dir,
      entry.name
    );

    if (entry.isDirectory()) {
      files.push(
        ...getAllJsFiles(fullPath)
      );

      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith('.js') &&
      !entry.name.endsWith('.test.js') &&
      !entry.name.endsWith('.spec.js')
    ) {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) =>
    a.localeCompare(b)
  );
}

function loadCommands(commandsPath, mode) {
  const commandFiles =
    getAllJsFiles(commandsPath);

  const commands = [];
  const seen = new Set();

  for (const filePath of commandFiles) {
    try {
      delete require.cache[
        require.resolve(filePath)
      ];

      const command = require(filePath);
      const name = command?.data?.name;

      if (
        !command?.data ||
        typeof command.execute !== 'function'
      ) {
        console.warn(
          `⚠️ Skipped invalid command: ${filePath}`
        );

        continue;
      }

      if (
        !name ||
        typeof name !== 'string'
      ) {
        console.warn(
          `⚠️ Skipped unnamed command: ${filePath}`
        );

        continue;
      }

      if (seen.has(name)) {
        console.warn(
          `⚠️ Skipped duplicate command: ${name} (${filePath})`
        );

        continue;
      }

      if (
        mode === 'global' &&
        command.devOnly === true
      ) {
        console.log(
          `🧪 Skipped dev-only command: ${name}`
        );

        continue;
      }

      seen.add(name);
      commands.push(command.data.toJSON());

      console.log(`✅ Loaded command: ${name}`);
    } catch (error) {
      console.error(
        `❌ Failed to load command: ${filePath}`
      );

      console.error(error);
    }
  }

  return commands;
}

function printSyncBanner(mode, commandsPath) {
  console.log('============================================================');
  console.log('🚀 Syncing Goliath Commands');
  console.log(`🧠 Bot Mode: ${BOT_MODE}`);
  console.log(`📄 Env: ${envFile}`);
  console.log(`🛠️ Command Mode: ${mode.toUpperCase()}`);
  console.log(`🆔 Client ID: ${CLIENT_ID}`);
  console.log(`📂 Commands Path: ${commandsPath}`);
  console.log('============================================================');
}

/* ---------------- DISCORD API ---------------- */

async function clearGuildCommands(guildId) {
  await rest.put(
    Routes.applicationGuildCommands(
      CLIENT_ID,
      guildId
    ),
    {
      body: [],
    }
  );

  console.log(
    `🧹 Cleared guild commands: ${guildId}`
  );
}

async function registerGuildCommands(
  guildId,
  commands
) {
  await rest.put(
    Routes.applicationGuildCommands(
      CLIENT_ID,
      guildId
    ),
    {
      body: commands,
    }
  );

  console.log(
    `✅ Registered ${commands.length} command(s) for guild: ${guildId}`
  );
}

async function syncGuildCommands(guildId, commands) {
  try {
    await clearGuildCommands(guildId);
    await registerGuildCommands(guildId, commands);

    return {
      guildId,
      ok: true,
      commands: commands.length,
    };
  } catch (error) {
    const reason = getDiscordErrorSummary(error);
    console.warn(`❌ Guild command sync failed for ${guildId}: ${reason}`);

    return {
      guildId,
      ok: false,
      commands: 0,
      reason,
      code: error?.code,
      status: error?.status,
    };
  }
}

async function clearGlobalCommands() {
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    {
      body: [],
    }
  );

  console.log('🧹 Cleared global commands');
}

async function registerGlobalCommands(commands) {
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    {
      body: commands,
    }
  );

  console.log(
    `✅ Registered ${commands.length} global command(s)`
  );
}

function printGuildSyncSummary(results) {
  const successful = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);

  console.log('============================================================');
  console.log('📋 Guild Command Sync Summary');
  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);

  for (const result of successful) {
    console.log(`✅ ${result.guildId} — ${result.commands} command(s)`);
  }

  for (const result of failed) {
    console.log(`❌ ${result.guildId} — ${result.reason}`);
  }

  console.log('============================================================');
}

/* ---------------- SYNC ---------------- */

async function syncCommands(options = {}) {
  const startedAt = Date.now();

  const mode = String(
    options.mode || COMMAND_MODE
  ).toLowerCase();

  const guildIds = parseGuildIds(
    options.guildIds ?? GUILD_IDS
  );

  const commandsPath =
    options.commandsPath ||
    path.join(
      process.cwd(),
      'src',
      'commands'
    );

  if (!ALLOWED_COMMAND_MODES.includes(mode)) {
    throw new Error(
      `❌ Invalid command mode "${mode}". Use "guild" or "global".`
    );
  }

  if (
    mode === 'guild' &&
    guildIds.length === 0
  ) {
    throw new Error(
      `❌ No valid guild IDs found for ${BOT_MODE} mode.`
    );
  }

  printSyncBanner(mode, commandsPath);

  const commands = loadCommands(
    commandsPath,
    mode
  );

  console.log(
    `📦 Commands loaded: ${commands.length}`
  );

  let guildResults = [];

  if (mode === 'guild') {
    console.log(
      `🏠 Target guilds: ${guildIds.join(', ')}`
    );

    for (const guildId of guildIds) {
      guildResults.push(await syncGuildCommands(guildId, commands));
    }

    printGuildSyncSummary(guildResults);

    if (!guildResults.some((result) => result.ok)) {
      throw new Error('❌ Command sync failed for every target guild.');
    }
  }

  if (mode === 'global') {
    await clearGlobalCommands();
    await registerGlobalCommands(commands);
  }

  const durationMs =
    Date.now() - startedAt;

  const failedGuilds = guildResults.filter((result) => !result.ok).length;

  console.log('============================================================');
  console.log(
    failedGuilds
      ? `⚠️ Command sync completed with ${failedGuilds} guild failure(s) in ${durationMs}ms`
      : `🎉 Command sync complete in ${durationMs}ms`
  );
  console.log('============================================================');

  return {
    botMode: BOT_MODE,
    commandMode: mode,
    commands: commands.length,
    guilds:
      mode === 'guild'
        ? guildIds.length
        : 0,
    successfulGuilds: guildResults.filter((result) => result.ok).length,
    failedGuilds,
    guildResults,
    durationMs,
  };
}

/* ---------------- DIRECT RUN ---------------- */

if (require.main === module) {
  syncCommands().catch((error) => {
    console.error('❌ Command sync failed');
    console.error(error);

    process.exit(1);
  });
}

module.exports = {
  syncCommands,
  parseGuildIds,
  getAllJsFiles,
  loadCommands,
  syncGuildCommands,
};
