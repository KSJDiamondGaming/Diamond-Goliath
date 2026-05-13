const fs = require('fs');
const path = require('path');

function getRuntimeRoot(botMode = process.env.BOT_MODE || 'DEV') {
  return path.join(process.cwd(), 'src', 'runtime', botMode.toLowerCase());
}

function getRuntimePaths(botMode = process.env.BOT_MODE || 'DEV') {
  const root = getRuntimeRoot(botMode);

  return {
    root,
    logs: path.join(root, 'logs'),
    guilds: path.join(root, 'guilds'),
    backups: path.join(root, 'backups'),
    database: path.join(root, 'database'),
  };
}

function ensureRuntimePaths(botMode = process.env.BOT_MODE || 'DEV') {
  const paths = getRuntimePaths(botMode);

  for (const folder of Object.values(paths)) {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
  }

  return paths;
}

module.exports = {
  getRuntimeRoot,
  getRuntimePaths,
  ensureRuntimePaths,
};