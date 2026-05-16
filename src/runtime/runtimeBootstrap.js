const fs = require('fs');
const path = require('path');

const VALID_MODES = ['DEV', 'BETA', 'PRODUCTION'];

function normalizeMode(mode) {
  const normalized = String(mode || process.env.BOT_MODE || 'DEV').toUpperCase();

  return VALID_MODES.includes(normalized) ? normalized : 'DEV';
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created runtime directory: ${dirPath}`);
  }
}

function bootstrapRuntime(mode) {
  const runtimeMode = normalizeMode(mode);
  const modeKey = runtimeMode.toLowerCase();

  const runtimeRoot = path.join(process.cwd(), 'src', 'runtime');
  const modeRoot = path.join(runtimeRoot, modeKey);

  const paths = {
    mode: runtimeMode,
    modeKey,

    runtimeRoot,
    root: modeRoot,

    backups: path.join(modeRoot, 'backups'),
    cache: path.join(modeRoot, 'cache'),
    data: path.join(modeRoot, 'data'),
    database: path.join(modeRoot, 'database'),
    guilds: path.join(modeRoot, 'guilds'),
    incidents: path.join(modeRoot, 'incidents'),
    logs: path.join(modeRoot, 'logs'),
    recovery: path.join(modeRoot, 'recovery'),
    security: path.join(modeRoot, 'security'),
    snapshots: path.join(modeRoot, 'snapshots'),
    temp: path.join(modeRoot, 'temp'),
    translation: path.join(modeRoot, 'translation'),
  };

  const requiredDirectories = [
    paths.runtimeRoot,
    paths.root,
    paths.backups,
    paths.cache,
    paths.data,
    paths.database,
    paths.guilds,
    paths.incidents,
    paths.logs,
    paths.recovery,
    paths.security,
    paths.snapshots,
    paths.temp,
    paths.translation,
  ];

  console.log(`🧱 Bootstrapping runtime folders for ${runtimeMode}...`);

  for (const dir of requiredDirectories) {
    ensureDir(dir);
  }

  console.log(`✅ Runtime folders ready: ${paths.root}`);

  return paths;
}

module.exports = {
  bootstrapRuntime,
};